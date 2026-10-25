# 가입 남용 대응과 연합 트래픽 보호

> **검증 상태: 운영 정책·사례 기반 가이드.** 서버 규모·운영 인력·커뮤니티 정책에 따라 적절한 방법이 달라집니다. 활성화된 방어 규칙의 정확한 임계값·식별자·우회 가능한 차단 조건은 공개하지 않습니다.

## 가입 승인제의 의미

가입을 열어 두면 신규 이용자가 쉽게 들어올 수 있지만 자동 가입·스팸을 직접 처리해야 할 수 있습니다. **가입 승인제**는 운영자가 확인하기 전 계정 활성화를 막는 대신, 정상 이용자의 대기 시간과 심사 부담을 늘립니다.

머스타드 운영에서는 자동 가입 남용 경험을 거쳐 승인제로 전환했고, 관리 알림을 통해 심사 부담을 줄였습니다. 다만 자동 알림은 심사 자체를 대체하지 않습니다.

심사에서는 **단일 특징에 의존하지 않고**, 계정 정보, 공개 활동, 반복 패턴, 신고 맥락을 함께 검토합니다. 이용자 정보를 불필요하게 수집하거나 공개하지 않습니다.

## 브라우저 가입과 API 가입 구분

Mastodon의 가입 경로와 커스텀 포크의 제어 방식은 버전·설정에 따라 다릅니다. 실제 운영 사례에서는 브라우저 가입 폼에서 **계정 생성 이전에 CAPTCHA를 검사**하도록 수정했습니다. 그 목적은 CAPTCHA 실패 건이 대기 중인 계정으로 계속 생성되지 않게 하는 것이었습니다.

CAPTCHA, 이메일 확인, 수동 승인, 가입 API 정책은 서로 다른 층위의 통제입니다. 하나를 설정했다고 나머지도 자동으로 해결되는 것은 아닙니다. 구체적인 도입 전에는 자신이 사용하는 Mastodon 버전과 가입 흐름을 테스트하세요.

## 연합 서버를 무조건 '봇'으로 판단하지 않기

Fediverse의 ActivityPub 트래픽은 다른 서버가 서버 간 HTTP 요청을 보내는 방식입니다. 브라우저용 봇 차단 기능이 이를 오탐하면 **원격 게시물 수신과 전달**이 막힐 수 있습니다.

실제 사례에서는 Cloudflare의 **Bot Fight Mode**를 활성화한 뒤 일부 연합 서버와 통신 문제가 발생했고, 해당 기능을 비활성화한 후 연합을 복구했습니다.

보안 설정 변경 후에는 웹사이트 접속만이 아니라 다음도 확인합니다.

- 원격 계정·게시물이 수신되는지
- 외부 서버가 보낸 Inbox 요청이 정상 처리되는지
- 상대 서버로 전송할 활동이 Sidekiq에서 진행되는지
- 정상 연합 트래픽을 실수로 차단하지 않았는지

WAF나 규칙 기반 차단을 검토하더라도 서버 간 ActivityPub 호출을 허용하는지 별도로 점검해야 합니다.

## 악성 계정과 악성 인스턴스 구분

특정 인스턴스에서 스팸이 반복된다고 해서 그곳의 모든 이용자가 같은 행위자라고 단정하지 않습니다. 가능한 경우 운영자에게 연락하고, 실질적 피해·반복성·운영 상태를 확인한 뒤 서버 차단 등 비례적 조치를 결정하세요.

오탐과 이의 제기 가능성도 기록해야 합니다. 자동 가입 방어에는 완벽한 신호가 없으며 IP, User-Agent, 계정명만으로 판단하면 오류가 생길 수 있습니다.

### 근거 자료

- [가입 승인 정책 변화](https://github.com/thanksstevenkim/mastodon-lab/blob/main/operations/account-approval-policy.md)
- [스팸 대응의 변화](https://github.com/thanksstevenkim/mastodon-lab/blob/main/operations/anti-spam-evolution.md)
- [가입 전 hCaptcha 운영 사례](https://github.com/thanksstevenkim/mastodon-lab/blob/main/runbooks/pre-registration-hcaptcha.md)
- [Cloudflare와 ActivityPub 충돌 기록](https://github.com/thanksstevenkim/mastodon-lab/blob/main/runbooks/cloudflare.md)
- [스팸·모더레이션 런북](https://github.com/thanksstevenkim/mastodon-lab/blob/main/runbooks/spam-and-moderation.md)
