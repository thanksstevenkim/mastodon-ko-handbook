# Elasticsearch Nori로 한국어 검색 개선하기

> **검증 상태: 실험·CI 통과, Mustard 운영 전환 확인(2026-11-02–03).** Mastodon 4.7.4 커스텀 포크와 Elasticsearch 8.19.15에서 확인한 **운영 사례**입니다. 공식 Mastodon의 기본 기능이나 모든 환경에 그대로 적용할 수 있는 배포·재색인 매뉴얼은 아닙니다.

## 기존 검색이 한국어를 놓칠 수 있는 이유

Mastodon의 기존 검색 분석기는 한국어 조사·어미를 충분히 분해하지 못할 수 있습니다. 예를 들어 게시물에 `마스토돈에서`가 있더라도 사용자가 `마스토돈`만 검색했을 때 검색 결과가 누락될 여지가 있습니다.

이를 개선하기 위해 Elasticsearch의 **Nori 한국어 형태소 분석 플러그인**을 검토했습니다. Nori는 검색 결과의 **재현율**을 높일 수 있지만, 관련 없는 문서까지 일치하는 **정밀도** 문제가 생길 수도 있습니다.

## 실험에서 사용한 설계

2026년 10월 Mustard 개발 사례에서는 다음 구성을 분리된 Elasticsearch **8.19.15** 실험 환경에서 검증했습니다.

- 버전과 일치하는 `analysis-nori` 플러그인
- `nori_tokenizer` / `decompound_mode: mixed`
- `nori_part_of_speech`, `nori_readingform`, `lowercase` 필터
- `겨자별`과 `연합우주`를 다루는 작은 사용자 사전
- 기존 `text`, `text.stemmed`에 더해 선택적으로 사용하는 `text.korean` 멀티필드

형태소 분석기를 기존 필드와 **교체하는 대신 추가 필드로 도입**해 기존 검색 동작을 보존하려 했습니다. 일반 단어 검색의 `multi_match` 대상에 한국어 필드를 더하되, 인용구 검색·해시태그 검색 등의 의미는 의도적으로 바꾸지 않았습니다.

## 도입 방식: 기존 인덱스를 남겨둔 점진적 전환

운영 전환에는 이미 존재하는 인덱스의 설정을 즉시 바꾸는 대신, **별도의 Nori 인덱스를 만들고 데이터와 검색 경로를 단계적으로 이전**하는 방식을 사용했습니다.

1. 기존 검색 인덱스의 백업과 독립 복원 가능성을 확인했습니다. 이는 Elasticsearch 검색 데이터 복구 검증이지 Mastodon 전체 서비스 복구 검증은 아닙니다.
2. 버전에 맞는 Nori 플러그인을 설치하고, 기존 `statuses`와 `public_statuses`는 유지한 채 `statuses_nori_v1`, `public_statuses_nori_v1`를 준비했습니다.
3. Sidekiq의 변경 사항을 기존 인덱스와 Nori 인덱스에 동기화하면서, 과거 게시물 백필과 누락분 보정을 완료했습니다.
4. 매핑과 검색 권한(ACL) 표본을 확인한 뒤, **Web 검색 읽기 경로만** Nori 인덱스로 전환했습니다. 이전 인덱스와 Web 이미지·설정은 롤백을 위해 보존했습니다.

이 과정은 Mustard의 커스텀 포크에서 구현·검증한 전환 사례입니다. 일반 운영자가 같은 이름의 인덱스나 플래그를 만들면 자동으로 작동한다는 뜻은 아닙니다.

## 기능 플래그의 역할과 한계

Mustard 포크에서 추가한 세 가지 플래그는 다음 역할을 합니다.

| 플래그 | Mustard 구현에서의 역할 |
| --- | --- |
| `ES_KOREAN_SEARCH_ENABLED` | Nori 분석기와 `text.korean` 필드 정의 등 한국어 검색 기능을 사용 |
| `ES_NORI_READ_ENABLED` | 별도 Nori 인덱스로 읽기 전환하는 기능의 활성화 조건 |
| `ES_NORI_READ_CUTOVER_ENABLED` | 실제 읽기 경로 전환을 명시적으로 승인하는 추가 조건 |

**세 값이 모두 정확히 `true`일 때** Mustard의 Nori 읽기 경로가 활성화되도록 구현했습니다. 나머지 경우에는 Nori 읽기 경로가 비활성화됩니다. 단, `ES_KOREAN_SEARCH_ENABLED` 자체는 인덱스 정의에도 영향을 주므로, 세 값을 단순한 독립적인 런타임 스위치로 간주해서는 안 됩니다.

**주의:** 이는 [Mustard 포크의 PR #16](https://github.com/thanksstevenkim/mastodon-v2/pull/16)에서 구현한 조건이지, 일반 Mastodon에 기본 제공되는 설정이 아닙니다. 플래그를 바꾼다고 플러그인이 설치되거나 인덱스가 생성·이전되는 것도 아닙니다. 준비되지 않은 인덱스를 대상으로 읽기만 전환하지 마세요.

## 실제로 어디까지 검증했나?

### 2026-10-25: 개발·실험

- 격리된 실험에서 합성 한국어 문장·사용자 사전의 분석 결과 확인
- 두 Chewy 인덱스의 Nori 필드 매핑 생성 검사
- 실제 Elasticsearch + Nori를 사용하는 통합 테스트에서 한국어 기본형 검색 확인
- **Nori CI: 23 examples, 0 failures**, 병합 후 Ruby Testing 내부 **13/13 작업 통과**
- [Nori 기능 PR #11](https://github.com/thanksstevenkim/mastodon-v2/pull/11) 병합

### 2026-11-02–03: 운영 적용

- Nori 인덱스에 대한 백필·보정 완료 및 검색 권한 **표본 100건** 확인(관찰한 표본에서 불일치 없음)
- Web에서 Nori 읽기 활성화와 `statuses_nori_v1`, `public_statuses_nori_v1` 검색 대상 확인
- Web 컨테이너 `healthy`, 로컬 HTTP 200 및 한국어 검색 UI 결과 확인
- 두 Nori 인덱스의 실제 매핑·분석기 설정이 기대값과 일치
- 관리자 Elasticsearch 시스템 검사 `PASS`, 관리자 화면의 기존 경고 해소 확인

**검증의 한계:** 권한 전수 검사, 모든 언어의 검색 품질, 정밀도·재현율 개선 폭, 실제 서비스의 검색 지연 변화, 대규모 동시 접근 부하는 보장하지 않습니다. 정상적인 검색 결과 몇 건과 `healthy` 상태만으로 이러한 항목까지 검증됐다고 판단하지 않습니다.

## 관리자에서 인덱스 경고가 남는다면

Mustard에서는 읽기 전환 후 실제 검색은 동작했지만 관리 화면에 `statuses`와 `public_statuses`의 매핑·사양 불일치 경고가 남았습니다. 기존 검사 코드가 **검색 중인 Nori 인덱스가 아니라 이전 인덱스**를 검사했기 때문입니다.

또한 Chewy 8.4.1의 `specification.changed?`는 Elasticsearch에 저장된 실제 매핑을 직접 비교하는 기능이 아니라, 저장된 Chewy 사양 기록과 현재 정의를 비교합니다. 따라서 `changed: true`만으로 실제 운영 인덱스가 잘못됐다고 단정할 수 없습니다.

[관리자 검사 수정 PR #17](https://github.com/thanksstevenkim/mastodon-v2/pull/17)에서는 Nori 읽기가 활성화됐을 때 **실제로 사용 중인 인덱스의 매핑과 분석기 설정**을 검사하도록 변경했습니다. 수정 후 시스템 검사에 통과했고, 관리자도 경고가 사라진 것을 확인했습니다.

**경고를 없애기 위해 즉시 `tootctl search deploy`로 재색인하지 마세요.** 먼저 실제 검색 대상과 인덱스 설정을 구분해 확인해야 합니다. 이 사례는 커스텀 포크의 검사 코드 문제였으며, 모든 Elasticsearch 경고가 거짓이라는 의미는 아닙니다.

## 운영 도입을 고려한다면

- 대상 Mastodon·Elasticsearch 버전과 Nori 플러그인 호환성, 현재 검색 인덱스의 구조를 파악합니다.
- 복구 가능한 검색 데이터 백업과 충분한 저장 공간을 준비합니다.
- 별도 인덱스 생성·동기화·권한 확인·읽기 전환·롤백을 **서로 다른 단계**로 구분합니다.
- 전환 후 실제 사용자 검색과 시스템 검사를 확인합니다. 기동 지연과 인덱스 오류를 바로 동일한 문제로 해석하지 않습니다.

**이 문서는 판단 기준을 위한 사례이며, 여러 환경에 그대로 실행할 수 있는 명령어 모음이 아닙니다.** 인덱스 삭제·재생성이나 운영 기능 플래그 변경 명령은 제공하지 않습니다.

### 근거 자료

- [Nori 개발·CI 검증 기록(2026-10-25)](https://github.com/thanksstevenkim/mastodon-lab/blob/main/operations/korean-nori-search-development-and-ci-validation-2026-10-25.md)
- [Nori 운영 전환 및 관리자 검사 수정 기록(2026-11-02–03)](https://github.com/thanksstevenkim/mastodon-lab/blob/main/operations/korean-nori-search-production-cutover-2026-11-02-03.md)
- [Mastodon 포크 PR #11](https://github.com/thanksstevenkim/mastodon-v2/pull/11) · [읽기 전환 PR #16](https://github.com/thanksstevenkim/mastodon-v2/pull/16) · [관리자 검사 수정 PR #17](https://github.com/thanksstevenkim/mastodon-v2/pull/17)
