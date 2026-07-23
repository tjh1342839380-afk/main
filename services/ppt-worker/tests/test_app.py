import json
import os
import tempfile
import unittest
import zipfile
from io import BytesIO
from pathlib import Path
from unittest import mock

import app as worker


def pptx_bytes() -> bytes:
    output = BytesIO()
    with zipfile.ZipFile(output, 'w') as archive:
        archive.writestr('[Content_Types].xml', '<Types/>')
        archive.writestr('ppt/presentation.xml', '<p:presentation/>')
    return output.getvalue()


class PptWorkerTest(unittest.TestCase):
    def setUp(self) -> None:
        worker.app.config['TESTING'] = True
        self.client = worker.app.test_client()

    def test_health_checks_authentication_and_scripts(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            scripts = Path(temp) / 'skills' / 'ppt-master' / 'scripts'
            scripts.mkdir(parents=True)
            (scripts / 'pptx_intake.py').write_text('', encoding='utf-8')
            (scripts / 'template_fill_pptx.py').write_text('', encoding='utf-8')
            with mock.patch.dict(os.environ, {
                'PPT_MASTER_ROOT': temp,
                'PPT_WORKER_TOKEN': 'secret',
            }, clear=False):
                self.assertEqual(self.client.get('/health').status_code, 200)
                self.assertEqual(self.client.get('/v1/health').status_code, 401)
                response = self.client.get('/v1/health', headers={'Authorization': 'Bearer secret'})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {
            'status': 'ok',
            'ppt_master_version': 'v4.1.0',
            'scripts_ready': True,
        })

    def test_analyze_returns_bounded_context_and_native_ids(self) -> None:
        def fake_run(args: list[str], timeout: int | None = None) -> None:
            del timeout
            if any('pptx_intake.py' in item for item in args):
                output_dir = Path(args[args.index('-o') + 1])
                output_dir.mkdir(parents=True, exist_ok=True)
                (output_dir / 'source.identity.json').write_text(json.dumps({
                    'canvas': {'width': 13.333, 'height': 7.5},
                    'theme': {'palette': {'accent1': '2563EB'}, 'fonts': {'major': 'Aptos'}},
                }), encoding='utf-8')
                (output_dir / 'source.slide_library.json').write_text(json.dumps({
                    'slide_count': 1,
                    'slides': [{
                        'slide_index': 1,
                        'page_type': 'cover',
                        'text_summary': 'Old title',
                        'slots': [{
                            'slot_id': 's01_sh2',
                            'role': 'title',
                            'text': 'Old title',
                            'geometry': {'x': 1, 'y': 1},
                            'text_metrics': {'char_count': 9},
                        }],
                        'tables': [],
                        'charts': [],
                    }],
                }), encoding='utf-8')
                (output_dir / 'source_profile.json').write_text(json.dumps({
                    'schema': 'pptx_intake_profile.v1',
                    'decks': [],
                }), encoding='utf-8')
                return
            output_path = Path(args[args.index('-o') + 1])
            output_path.write_text('# Slide 1\nOld title', encoding='utf-8')

        with mock.patch.object(worker, '_run', side_effect=fake_run):
            response = self.client.post('/v1/analyze', data={
                'file': (BytesIO(pptx_bytes()), 'template.pptx'),
            })

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(payload['slide_count'], 1)
        self.assertIn('slot s01_sh2', payload['analysis_text'])
        self.assertEqual(payload['slide_library']['slides'][0]['page_type'], 'cover')

    def test_fill_validates_and_returns_a_pptx(self) -> None:
        def fake_run(args: list[str], timeout: int | None = None) -> None:
            del timeout
            command = next((item for item in ('analyze', 'check-plan', 'apply') if item in args), '')
            output_path = Path(args[args.index('-o') + 1])
            if command == 'analyze':
                output_path.write_text(json.dumps({'slide_count': 1, 'slides': []}), encoding='utf-8')
            elif command == 'check-plan':
                output_path.write_text(json.dumps({'summary': {'ok': 1, 'warn': 0, 'error': 0}}), encoding='utf-8')
            elif command == 'apply':
                output_path.write_bytes(pptx_bytes())

        plan = {
            'schema': 'template_fill_pptx_plan.v1',
            'status': 'confirmed',
            'accepted_warnings': [],
            'slides': [{
                'source_slide': 1,
                'replacements': [{'slot_id': 's01_sh2', 'text': 'New title'}],
                'table_edits': [],
                'chart_edits': [],
            }],
        }
        with mock.patch.object(worker, '_run', side_effect=fake_run):
            response = self.client.post('/v1/fill', data={
                'file': (BytesIO(pptx_bytes()), 'template.pptx'),
                'plan': json.dumps(plan),
                'output_name': 'result.pptx',
            })

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.mimetype, worker.PPTX_MIME_TYPE)
        self.assertIn('result.pptx', response.headers['Content-Disposition'])
        with zipfile.ZipFile(BytesIO(response.data)) as archive:
            self.assertIn('ppt/presentation.xml', archive.namelist())

    def test_fill_rejects_unconfirmed_plan(self) -> None:
        response = self.client.post('/v1/fill', data={
            'file': (BytesIO(pptx_bytes()), 'template.pptx'),
            'plan': json.dumps({'status': 'draft', 'slides': []}),
        })

        self.assertEqual(response.status_code, 400)
        self.assertIn('confirmed', response.get_json()['message'])


if __name__ == '__main__':
    unittest.main()
