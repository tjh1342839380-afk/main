from __future__ import annotations

import hmac
import json
from io import BytesIO
import os
import re
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path
from typing import Any

from flask import Flask, Response, jsonify, request, send_file
from werkzeug.exceptions import RequestEntityTooLarge


PPT_MASTER_VERSION = 'v4.1.0'
PPTX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
MAX_ANALYSIS_TEXT_LENGTH = 60000
MAX_MARKDOWN_LENGTH = 40000

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = int(os.getenv('PPT_WORKER_MAX_FILE_BYTES', str(50 * 1024 * 1024))) + 3 * 1024 * 1024


def _ppt_master_root() -> Path:
    return Path(os.getenv('PPT_MASTER_ROOT', '/opt/ppt-master')).resolve()


def _scripts_dir() -> Path:
    return _ppt_master_root() / 'skills' / 'ppt-master' / 'scripts'


def _safe_error(value: str, fallback: str) -> str:
    text = re.sub(r'[\r\n]+', ' ', value).strip()
    return text[-1000:] if text else fallback


def _run(args: list[str], timeout: int | None = None) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(
        args,
        check=False,
        capture_output=True,
        text=True,
        encoding='utf-8',
        errors='replace',
        timeout=timeout or int(os.getenv('PPT_WORKER_PROCESS_TIMEOUT', '180')),
    )
    if result.returncode != 0:
        raise RuntimeError(_safe_error(result.stderr or result.stdout, 'PPT Master 执行失败'))
    return result


def _validate_pptx(path: Path) -> None:
    if path.suffix.lower() != '.pptx':
        raise ValueError('仅支持 .pptx 文件')
    try:
        with zipfile.ZipFile(path) as archive:
            names = set(archive.namelist())
    except zipfile.BadZipFile as exc:
        raise ValueError('上传的文件不是有效的 PPTX') from exc
    if '[Content_Types].xml' not in names or 'ppt/presentation.xml' not in names:
        raise ValueError('上传的文件缺少 PPTX 核心结构')


def _save_upload(work_dir: Path) -> Path:
    uploaded = request.files.get('file')
    if uploaded is None or not uploaded.filename:
        raise ValueError('缺少 file 文件字段')
    path = work_dir / 'source.pptx'
    uploaded.save(path)
    if path.stat().st_size > int(os.getenv('PPT_WORKER_MAX_FILE_BYTES', str(50 * 1024 * 1024))):
        raise ValueError('PPTX 文件超过服务端大小限制')
    _validate_pptx(path)
    return path


def _read_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding='utf-8'))
    if not isinstance(value, dict):
        raise RuntimeError(f'{path.name} 不是 JSON 对象')
    return value


def _compact(value: Any, limit: int = 180) -> str:
    text = str(value or '').replace('\r', ' ').replace('\n', ' ').strip()
    return re.sub(r'\s+', ' ', text)[:limit]


def _build_analysis_text(
    file_name: str,
    identity: dict[str, Any],
    library: dict[str, Any],
    markdown: str,
) -> str:
    theme = identity.get('theme') if isinstance(identity.get('theme'), dict) else {}
    lines = [
        f'PPT Master {PPT_MASTER_VERSION} template analysis',
        f'file: {file_name}',
        f'slide_count: {library.get("slide_count", 0)}',
        f'canvas: {json.dumps(identity.get("canvas", {}), ensure_ascii=False)}',
        f'theme_palette: {json.dumps(theme.get("palette", {}), ensure_ascii=False)}',
        f'theme_fonts: {json.dumps(theme.get("fonts", {}), ensure_ascii=False)}',
        '',
        'Use source_slide to choose/reuse a layout. Use exact slot_id/table_id/chart_id values in fill_presentation_template.',
    ]
    slides = library.get('slides') if isinstance(library.get('slides'), list) else []
    for slide in slides:
        if not isinstance(slide, dict):
            continue
        lines.extend([
            '',
            f'## slide {slide.get("slide_index")} | page_type={_compact(slide.get("page_type"), 80)}',
            f'summary: {_compact(slide.get("text_summary"), 500)}',
        ])
        slots = slide.get('slots') if isinstance(slide.get('slots'), list) else []
        for slot in slots:
            if not isinstance(slot, dict):
                continue
            metrics = slot.get('text_metrics') if isinstance(slot.get('text_metrics'), dict) else {}
            geometry = slot.get('geometry') if isinstance(slot.get('geometry'), dict) else {}
            lines.append(
                '- slot '
                f'{_compact(slot.get("slot_id"), 80)} role={_compact(slot.get("role"), 60)} '
                f'chars={metrics.get("char_count", "?")} geometry={json.dumps(geometry, ensure_ascii=False)} '
                f'text="{_compact(slot.get("text"), 300)}"'
            )
        tables = slide.get('tables') if isinstance(slide.get('tables'), list) else []
        for table in tables:
            if isinstance(table, dict):
                lines.append(
                    f'- table {_compact(table.get("table_id"), 80)} '
                    f'rows={table.get("row_count", 0)} cols={table.get("column_count", 0)}'
                )
        charts = slide.get('charts') if isinstance(slide.get('charts'), list) else []
        for chart in charts:
            if isinstance(chart, dict):
                lines.append(
                    f'- chart {_compact(chart.get("chart_id"), 80)} '
                    f'type={_compact(chart.get("chart_type"), 80)} '
                    f'categories={chart.get("category_count", 0)} series={chart.get("series_count", 0)}'
                )
        if len('\n'.join(lines)) >= MAX_ANALYSIS_TEXT_LENGTH:
            lines.extend(['', '[analysis truncated]'])
            break

    if markdown.strip() and len('\n'.join(lines)) < MAX_ANALYSIS_TEXT_LENGTH - 1000:
        remaining = MAX_ANALYSIS_TEXT_LENGTH - len('\n'.join(lines))
        lines.extend(['', '## extracted_content', markdown.strip()[:remaining]])
    return '\n'.join(lines)[:MAX_ANALYSIS_TEXT_LENGTH]


def _cors_origins() -> set[str]:
    return {item.strip() for item in os.getenv('PPT_WORKER_CORS_ORIGINS', '*').split(',') if item.strip()}


@app.before_request
def authenticate() -> Response | tuple[Response, int] | None:
    if request.method == 'OPTIONS' or request.path == '/health':
        return None
    token = os.getenv('PPT_WORKER_TOKEN', '').strip()
    if not token:
        return None
    if not hmac.compare_digest(request.headers.get('Authorization', ''), f'Bearer {token}'):
        return jsonify({'error': 'unauthorized', 'message': 'PPT Master 服务令牌无效'}), 401
    return None


@app.after_request
def add_cors_headers(response: Response) -> Response:
    origin = request.headers.get('Origin', '')
    allowed = _cors_origins()
    if '*' in allowed:
        response.headers['Access-Control-Allow-Origin'] = '*'
    elif origin in allowed:
        response.headers['Access-Control-Allow-Origin'] = origin
        response.headers['Vary'] = 'Origin'
    response.headers['Access-Control-Allow-Headers'] = 'Authorization, Content-Type'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    response.headers['X-PPT-Master-Version'] = PPT_MASTER_VERSION
    response.headers['Cache-Control'] = 'no-store'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    return response


@app.route('/health', methods=['GET', 'OPTIONS'])
@app.route('/v1/health', methods=['GET', 'OPTIONS'])
def health() -> Response | tuple[Response, int]:
    if request.method == 'OPTIONS':
        return Response(status=204)
    scripts_ready = (_scripts_dir() / 'pptx_intake.py').is_file() and (_scripts_dir() / 'template_fill_pptx.py').is_file()
    status = 200 if scripts_ready else 503
    return jsonify({
        'status': 'ok' if scripts_ready else 'error',
        'ppt_master_version': PPT_MASTER_VERSION,
        'scripts_ready': scripts_ready,
    }), status


@app.route('/v1/analyze', methods=['POST', 'OPTIONS'])
def analyze() -> Response | tuple[Response, int]:
    if request.method == 'OPTIONS':
        return Response(status=204)
    try:
        with tempfile.TemporaryDirectory(prefix='ppt-master-analyze-') as temp:
            work_dir = Path(temp)
            source = _save_upload(work_dir)
            analysis_dir = work_dir / 'analysis'
            markdown_path = work_dir / 'source.md'
            _run([sys.executable, str(_scripts_dir() / 'pptx_intake.py'), str(source), '-o', str(analysis_dir)])
            _run([sys.executable, str(_scripts_dir() / 'source_to_md' / 'ppt_to_md.py'), str(source), '-o', str(markdown_path)])
            identity = _read_json(analysis_dir / 'source.identity.json')
            library = _read_json(analysis_dir / 'source.slide_library.json')
            profile = _read_json(analysis_dir / 'source_profile.json')
            markdown = markdown_path.read_text(encoding='utf-8', errors='replace')[:MAX_MARKDOWN_LENGTH]
            file_name = request.files['file'].filename or 'source.pptx'
            return jsonify({
                'ppt_master_version': PPT_MASTER_VERSION,
                'slide_count': int(library.get('slide_count') or 0),
                'analysis_text': _build_analysis_text(file_name, identity, library, markdown),
                'identity': identity,
                'slide_library': library,
                'source_profile': profile,
                'markdown': markdown,
            })
    except (ValueError, json.JSONDecodeError) as exc:
        return jsonify({'error': 'invalid_request', 'message': str(exc)}), 400
    except subprocess.TimeoutExpired:
        return jsonify({'error': 'timeout', 'message': 'PPT Master 分析超时'}), 504
    except Exception as exc:
        app.logger.exception('PPT Master analysis failed')
        return jsonify({'error': 'analysis_failed', 'message': _safe_error(str(exc), 'PPT Master 分析失败')}), 500


@app.route('/v1/fill', methods=['POST', 'OPTIONS'])
def fill() -> Response | tuple[Response, int]:
    if request.method == 'OPTIONS':
        return Response(status=204)
    try:
        plan_text = request.form.get('plan', '')
        if not plan_text or len(plan_text.encode('utf-8')) > 2 * 1024 * 1024:
            raise ValueError('缺少 plan，或 plan 超过 2 MB')
        plan = json.loads(plan_text)
        if not isinstance(plan, dict):
            raise ValueError('plan 必须是 JSON 对象')
        if plan.get('status') != 'confirmed':
            raise ValueError('plan.status 必须为 confirmed')

        with tempfile.TemporaryDirectory(prefix='ppt-master-fill-') as temp:
            work_dir = Path(temp)
            source = _save_upload(work_dir)
            library_path = work_dir / 'source.slide_library.json'
            plan_path = work_dir / 'fill_plan.json'
            report_path = work_dir / 'check_report.json'
            output_path = work_dir / 'result_20000101_000000.pptx'
            plan_path.write_text(json.dumps(plan, ensure_ascii=False, indent=2), encoding='utf-8')

            _run([
                sys.executable,
                str(_scripts_dir() / 'template_fill_pptx.py'),
                'analyze',
                str(source),
                '-o',
                str(library_path),
            ])
            try:
                _run([
                    sys.executable,
                    str(_scripts_dir() / 'template_fill_pptx.py'),
                    'check-plan',
                    str(library_path),
                    str(plan_path),
                    '-o',
                    str(report_path),
                ])
            except RuntimeError as exc:
                report = _read_json(report_path) if report_path.is_file() else None
                return jsonify({
                    'error': 'plan_validation_failed',
                    'message': str(exc),
                    'validation_report': report,
                }), 422

            _run([
                sys.executable,
                str(_scripts_dir() / 'template_fill_pptx.py'),
                'apply',
                str(source),
                str(plan_path),
                '-o',
                str(output_path),
            ])
            _validate_pptx(output_path)
            output_name = request.form.get('output_name', 'presentation.pptx')
            output_name = re.sub(r'[<>:"/\\|?*\x00-\x1f]', '_', output_name).strip(' .')[:100]
            if not output_name.lower().endswith('.pptx'):
                output_name = f'{output_name or "presentation"}.pptx'
            return send_file(BytesIO(output_path.read_bytes()), mimetype=PPTX_MIME_TYPE, as_attachment=True, download_name=output_name)
    except (ValueError, json.JSONDecodeError) as exc:
        return jsonify({'error': 'invalid_request', 'message': str(exc)}), 400
    except subprocess.TimeoutExpired:
        return jsonify({'error': 'timeout', 'message': 'PPT Master 生成超时'}), 504
    except Exception as exc:
        app.logger.exception('PPT Master fill failed')
        return jsonify({'error': 'fill_failed', 'message': _safe_error(str(exc), 'PPT Master 生成失败')}), 500


@app.errorhandler(RequestEntityTooLarge)
def file_too_large(_: RequestEntityTooLarge) -> tuple[Response, int]:
    return jsonify({'error': 'file_too_large', 'message': 'PPTX 文件超过服务端大小限制'}), 413


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.getenv('PORT', '8080')))
