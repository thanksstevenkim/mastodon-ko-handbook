# 실험·검증 기록 (Labs)

> **이곳의 문서들은 필수 설치 절차가 아닙니다.** 실제 환경에서 어떤 명령을 실행했고 무엇이 성공·실패했는지 보존한 **근거 자료**입니다. 초보 운영자는 [Getting Started](../getting-started/05-initial-setup.md)에서 시작하세요.

| 기록 | 무엇을 담았나 |
| --- | --- |
| [UTM Mastodon v4.7.3 설치](utm-install-v4.7.3.md) | Ubuntu·Docker·웹·미디어·계정 기능 실측 |
| [기본편에서 옮긴 초기 실측 사례](early-install-notes-20261025.md) | 서버 준비·Caddy·Compose·초기 오류와 해결 기록 |
| [SCRAM 신규 설치·백업·독립 복원](secure-install-and-restore-20261026.md) | 신규 설치, 별도 VM 복원, 관리자 비밀번호 검증, Streaming 기동 |
| [암호화 백업·임시 PostgreSQL 복원](backup-restore-field-notes-20261025.md) | GPG·체크섬·덤프 복원 검증 당시 기록 |
| [독립 VM 재해 복구 실험](utm-disaster-recovery-v4.7.3.md) | 별도 VM에서 복원·HTTPS·로그인·재시작 확인 |

**현재 남은 미확인 항목:** SCRAM 독립 복원 실험의 Sidekiq는 컨테이너 시작에 성공했지만 헬스체크 완료를 확인하지 못했습니다. 격리 Streaming의 HTTP 헬스체크는 통과했으나 실시간 WebSocket 이벤트 전달 검증은 별도입니다. 이 미확인을 이유로 설치 가이드에 새로운 실험 VM이나 추가 체크포인트를 요구하지 않습니다.

## 기록을 읽는 방법

- 개별 문서의 '미검증'은 **해당 날짜·단계의 상태**일 수 있습니다. 이후 기록을 함께 확인하세요.
- 실험용 `.test` 도메인, UTM의 사설 IP, 별도 Docker 네트워크, 일회성 DB·CA 정책을 **인터넷 운영 서버에 그대로 적용하지 마세요**.
- 필수 실행 절차는 [05. 최초 설치](../getting-started/05-initial-setup.md), 기본 보안 설정은 [05B](../getting-started/05b-secure-configuration.md), 백업 운영 판단은 [Operations](../operations/backup-readiness.md)를 보세요.

[← 핸드북 목차](../../README.md)
