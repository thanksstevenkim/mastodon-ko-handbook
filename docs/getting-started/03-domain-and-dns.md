# 03. 도메인·DNS·HTTPS와 메일 준비

> **검증 상태:** Mastodon 공식 설정 및 일반 DNS 운영 원칙 기반 입문 안내 · **작성 기준:** 2026-10-25. 예시 도메인 `example.com`은 실제 서버 주소가 아닙니다.

[← 02. 서버 준비](02-prerequisites.md) · [다음: Docker Compose →](04-docker-compose.md)

## 도메인은 서버의 장기 식별자

Mastodon의 `LOCAL_DOMAIN`은 단순한 표시 이름이 아니라 **연합우주에서 계정과 서버를 식별하는 도메인**입니다. 예를 들어 `example.com`으로 시작했다면 계정 주소가 `@alice@example.com` 형태가 됩니다.

**`LOCAL_DOMAIN`은 서버 운영 이후 안전하게 바꾸기 어렵습니다.** 처음부터 오래 소유할 수 있는 도메인을 선택하세요. 사용자는 보통 도메인 기반 웹 페이지를 이용하며, `WEB_DOMAIN`으로 화면에 쓰는 호스트를 나누는 고급 구성도 가능하지만 DNS·WebFinger·프록시가 더 복잡해집니다.

## 기본 DNS 레코드

| 종류 | 용도 | 주의사항 |
| --- | --- | --- |
| `A` | 서비스 호스트 → IPv4 | 실제 서버의 공개 IPv4 |
| `AAAA` | 서비스 호스트 → IPv6 | IPv6 연결이 **정상 작동할 때만** 게시 |
| `CNAME` | 하위 도메인의 별칭 | DNS 제공자의 제약과 루트 도메인 처리 확인 |
| `MX` | 해당 도메인으로 들어오는 메일 | 메일 수신 서비스를 쓸 때 제공자 지침에 따라 구성 |
| `TXT` | SPF/DKIM/DMARC 등 발신 메일 인증 | 구체적 값은 메일 서비스 제공자의 안내를 따름 |

예를 들어 웹 호스트를 `social.example.com`으로 정했다면 DNS A/AAAA는 **그 호스트**에 적용되어야 합니다. 반대로 `LOCAL_DOMAIN=example.com`, `WEB_DOMAIN=social.example.com`처럼 분리하면 별도의 공식 설정 절차를 확인해야 합니다.

DNS 조회 예시 (`dig`가 설치된 관리용 컴퓨터에서):

```bash
dig +short A social.example.com
dig +short AAAA social.example.com
dig +short MX example.com
```

조회 결과가 예상 IP인지 확인하세요. 새로운 레코드가 전체 인터넷에 반영되는 데에는 DNS 캐시와 TTL에 따른 시간이 필요할 수 있습니다.

## HTTPS와 리버스 프록시

일반적인 운영 구성에서는 인터넷의 443/TCP 요청이 Nginx 같은 **리버스 프록시**로 들어와 Web과 Streaming으로 분기됩니다. 최초 인증서 발급이나 HTTP→HTTPS 전환을 위해 80/TCP가 필요할 수 있습니다.

- 인증서의 도메인 이름이 사용자가 접속하는 호스트와 일치해야 합니다.
- HTTPS 자동 갱신을 구성하고 만료 전 상태를 확인합니다.
- 리버스 프록시가 Web/Streaming 연결을 적절히 라우팅하는지 확인합니다.
- Cloudflare 같은 프록시/CDN을 사용하면 오리진 접속 방식과 인증서 설정을 별도로 검증합니다.

```bash
# DNS가 준비된 이후, 공개 URL을 가진 서버에서만 실행
curl -I --max-time 10 https://social.example.com/
```

위 명령은 HTTP 헤더만 확인합니다. **정상 로그인, 미디어 업로드, 연합 송수신이 된다는 의미는 아닙니다.** 실제 도메인으로 바꿔서 사용하세요.

## 실측 사례: UTM 로컬 HTTPS 프록시용 Caddy 설치 (2026-10-25)

**검증 상태: Caddy 설치 및 systemd 서비스 실행 확인. `mastodon.test` 리버스 프록시 설정·로컬 인증서 발급·맥북 브라우저 접속은 아직 미검증.**

Mastodon 4.7.3의 Web·Sidekiq·Streaming을 포함한 핵심 컨테이너 다섯 개가 `healthy`이고 Web·Streaming Health가 각각 `OK`인 UTM Ubuntu 24.04.5 ARM64 VM에서 로컬 HTTPS 프록시를 준비했습니다.

- VM의 DHCP 주소: `192.168.64.4/24` (실험 당시 값이며 고정 IP가 아님)
- 설치 전 `ss -ltnp`에서 호스트 TCP 80/443 포트에 바인딩된 서비스 없음
- Caddy 공식 안정 버전 APT 저장소를 등록한 뒤 `caddy` ARM64 패키지 설치
- `caddy version`: `v2.11.7`
- `systemctl is-active caddy`: `active`

이 실험에서는 외부 공개용 TLS 인증서 대신 Caddy의 **`tls internal` 로컬 인증기관**을 사용할 계획입니다. 이 인증기관을 클라이언트의 신뢰 저장소에 등록하는 작업에는 해당 클라이언트에 대한 신뢰 권한이 수반되므로, 루트 인증서를 검증한 다음 필요한 장치에서만 적용해야 합니다.

`mastodon.test`는 예약된 테스트 도메인이므로 공인 DNS·Let's Encrypt·실제 연합 통신을 전제로 하지 않습니다. 공개 서버에서 `LOCAL_DOMAIN`을 선택하고 HTTPS를 설정하는 절차와는 구분하세요.

## 메일은 별도 준비 항목

Mastodon은 계정 확인, 알림, 비밀번호 복구 등에 메일 발송이 필요합니다. 운영 초기부터 **신뢰할 수 있는 SMTP 제공자**를 준비하는 편이 좋습니다.

- 발신 주소와 SMTP 서버·포트·인증 방식을 정합니다.
- SPF·DKIM·DMARC는 발송 서비스에 맞춰 구성하고 실제 메일 헤더를 확인합니다.
- 자체 SMTP 서버를 운영한다면 PTR(역방향 DNS), 전달 평판, 수신 거부 대응 등 별도 운영 부담이 생깁니다.
- 메일 계정 비밀번호와 API 키는 공개 저장소 또는 스크린샷에 넣지 않습니다.

메일 전송이 정상인지 테스트한 뒤 가입을 개방해야 이용자가 확인·복구 메일을 받지 못하는 문제를 줄일 수 있습니다.

## 연합우주 특유의 주의사항

WAF의 자동 '봇' 차단 기능이 서버 간 ActivityPub 요청을 잘못 막을 수 있습니다. **웹사이트가 열리는지와 연합이 가능한지는 서로 다른 검증 항목**입니다. 자세한 내용은 [가입 남용과 연합 보호](../security/registration-and-federation.md)를 참고하세요.

## 준비 완료 체크리스트

- [ ] 오래 유지할 서비스 도메인을 정했다.
- [ ] 공개 IPv4/IPv6 레코드가 올바르며 미사용 AAAA는 제거했다.
- [ ] HTTPS 인증서와 갱신 계획을 마련했다.
- [ ] 실제 SMTP 발송 테스트를 할 수 있다.
- [ ] CDN/WAF가 연합 트래픽을 오탐하지 않는지 확인할 계획이다.

### 참고 자료

- [Mastodon 환경변수: LOCAL_DOMAIN / WEB_DOMAIN](https://docs.joinmastodon.org/admin/config/)
- [Mastodon 공식 설치 및 TLS 구성](https://docs.joinmastodon.org/admin/install/)
- [Cloudflare와 ActivityPub 충돌 경험](https://github.com/thanksstevenkim/mastodon-lab/blob/main/runbooks/cloudflare.md)
