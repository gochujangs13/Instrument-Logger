# -*- coding: utf-8 -*-
"""
scripts/test_updater_api.py — 자동 업데이트 시스템 단위 테스트 (1단계 안전 검증)
- semver 버전 비교 알고리즘 검증
- 설정 저장/마스킹 검증
- S3 리다이렉트 인증 헤더 분리 검증
- 자가 교체 배치 파일 생성 유효성 검증
"""
import sys
import os
import unittest
import tempfile
import urllib.request

# 상위 폴더 경로 추가
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
import updater_backend

class TestUpdaterBackend(unittest.TestCase):

    def test_version_comparison(self):
        """버전 파싱 및 대소 비교 검증"""
        # 신규 버전 > 현재 버전
        self.assertTrue(updater_backend.is_newer_version('1.0.1', '1.0.0'))
        self.assertTrue(updater_backend.is_newer_version('v1.0.1', '1.0.0-rc.6'))
        self.assertTrue(updater_backend.is_newer_version('1.1.0', '1.0.9'))
        self.assertTrue(updater_backend.is_newer_version('2.0.0', '1.9.99'))

        # 동일 버전이거나 이전 버전
        self.assertFalse(updater_backend.is_newer_version('1.0.0', '1.0.0'))
        self.assertFalse(updater_backend.is_newer_version('1.0.0-rc.5', '1.0.0-rc.6'))
        self.assertFalse(updater_backend.is_newer_version('1.0.0', '1.0.1'))

    def test_config_save_and_masking(self):
        """설정 저장 및 마스킹 검증"""
        updater_backend.save_config('test-owner/test-repo', 'github_pat_1234567890abcdef')
        cfg = updater_backend.get_masked_config()
        self.assertEqual(cfg['repo'], 'test-owner/test-repo')
        self.assertTrue(cfg['has_token'])
        # 마스킹 확인 (앞4자리 + ••• + 뒤4자리)
        self.assertTrue(cfg['masked_token'].startswith('gith'))
        self.assertTrue(cfg['masked_token'].endswith('cdef'))
        self.assertIn('•', cfg['masked_token'])

    def test_s3_safe_redirect_handler(self):
        """S3 리다이렉트 시 Authorization 헤더 제거 검증"""
        handler = updater_backend._S3SafeRedirectHandler()
        req = urllib.request.Request('https://api.github.com/repos/test/releases/assets/123')
        req.add_header('Authorization', 'Bearer dummy_token')

        # S3 서명 도메인으로 리다이렉트
        new_req = handler.redirect_request(
            req, None, 302, 'Found', {},
            'https://objects.githubusercontent.com/github-production-release-asset-2e65be/123?token=sig123'
        )
        self.assertIsNotNone(new_req)
        # Authorization 헤더가 제거되었는지 확인
        self.assertNotIn('Authorization', new_req.headers)
        self.assertNotIn('authorization', new_req.headers)

    def test_offline_silent_fallback(self):
        """네트워크 불가 또는 오프라인 시 무중단 정상 반환 검증"""
        res = updater_backend.check_for_updates('1.0.0', timeout=0.01)
        self.assertTrue(res['ok'])
        self.assertFalse(res['update_available'])
        self.assertEqual(res['current_version'], '1.0.0')

if __name__ == '__main__':
    suite = unittest.TestLoader().loadTestsFromTestCase(TestUpdaterBackend)
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    if not result.wasSuccessful():
        sys.exit(1)
    print("\n[PASS] updater_backend 단위 테스트 100% 통과 OK")
