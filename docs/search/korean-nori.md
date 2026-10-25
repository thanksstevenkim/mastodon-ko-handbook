# Elasticsearch Nori로 한국어 검색 개선하기

> **검증 상태: 별도 실험 및 CI 통합 테스트 통과 · 운영 도입 미검증.** 이 문서는 설계와 검증 근거를 설명하는 **실험 사례**입니다. 운영 Elasticsearch에 바로 적용할 수 있는 배포/재색인 매뉴얼이 아닙니다.

## 기존 검색이 한국어를 놓칠 수 있는 이유

Mastodon의 기존 검색 분석기는 한국어 조사·어미를 충분히 분해하지 못할 수 있습니다. 예를 들어 게시물에 `마스토돈에서`가 있더라도 사용자가 `마스토돈`만 검색했을 때 검색 결과가 누락될 여지가 있습니다.

이를 개선하기 위해 Elasticsearch의 **Nori 한국어 형태소 분석 플러그인**을 검토했습니다. Nori는 검색 결과의 **재현율**을 높일 수 있지만, 관련 없는 문서까지 일치하는 **정밀도** 문제가 생길 수도 있습니다.

## 실험에서 사용한 설계

2026년 10월 머스타드 개발 사례에서는 다음 구성을 분리된 Elasticsearch **8.19.15** 실험 환경에서 검증했습니다.

- 버전과 일치하는 `analysis-nori` 플러그인
- `nori_tokenizer` / `decompound_mode: mixed`
- `nori_part_of_speech`, `nori_readingform`, `lowercase` 필터
- `겨자별`과 `연합우주`를 다루는 작은 사용자 사전
- 기존 `text`, `text.stemmed`에 더해 선택적으로 사용하는 `text.korean` 멀티필드

형태소 분석기를 기존 필드와 **교체하는 대신 추가 필드로 도입**해 기존 언어의 검색 동작을 유지하려 했습니다. 일반 단어 검색의 `multi_match` 대상에 한국어 필드를 더하되, 인용구 검색·해시태그 검색 등의 의미는 의도적으로 바꾸지 않았습니다.

## 기능 플래그의 역할과 한계

실험 브랜치에서 추가한 `ES_KOREAN_SEARCH_ENABLED`는 기본값이 비활성화입니다.

| 상태 | 쿼리와 인덱스 정의 |
| --- | --- |
| 미설정 또는 `false` | 기존 `text`, `text.stemmed` 검색 경로 유지 |
| `true` | Nori 분석기 및 `text.korean` 필드를 사용하는 구성 |

**주의:** 플래그는 인덱스에 존재하지 않는 필드를 자동으로 만들어 주는 스위치가 아닙니다. 활성화 전에 플러그인 설치, 인덱스 매핑 구성, 기존 자료 재색인 또는 인덱스 전환, 복구 계획을 함께 확인해야 합니다.

## 어디까지 검증했나? (2026-10-25)

- 격리된 실험에서 합성 한국어 문장·사용자 사전의 분석 결과 확인
- 두 Chewy 인덱스(`StatusesIndex`, `PublicStatusesIndex`)의 Nori 필드 매핑 생성 검사
- 실제 Elasticsearch + Nori를 사용하는 통합 테스트에서 한국어 기본형 검색 확인
- 일반 검색 테스트를 함께 실행한 **Nori CI: 23 examples, 0 failures**
- 병합 이후 GitHub Actions Ruby Testing 내부 **13/13 작업 통과**
- [코드 변경 PR #11](https://github.com/thanksstevenkim/mastodon-v2/pull/11)은 2026-10-25에 `main`에 병합

이는 **소스코드 및 테스트 통과**를 뜻할 뿐, 운영 Mastodon에서의 검색 품질·색인 성능·인덱스 크기·다운타임·롤백을 검증한 것은 아닙니다. 운영 검색 환경에는 아직 이 작업을 배포하거나 재색인하지 않았습니다.

## 운영 도입 전에 필요한 단계

1. 기존 Elasticsearch 버전, 플러그인, 인덱스 이름·매핑·문서 수를 확인합니다.
2. 복구 가능한 검색 인덱스 백업/스냅샷과 저장 공간을 검증합니다.
3. 동일 버전 Nori 플러그인이 들어간 **별도 후보 이미지**를 준비합니다.
4. 운영과 분리된 환경에서 전체 데이터에 가까운 색인·검색 및 부하를 연습합니다.
5. 기존 인덱스를 보존하는 전환·일관성·롤백 계획을 작성합니다.
6. 비로소 계획된 점검 시간에 별도 운영 배포를 수행합니다.

인덱스 삭제 명령이나 운영 플래그를 먼저 바꾸는 명령은 이 문서에 넣지 않았습니다.

### 근거 자료

- [Nori 개발·CI 검증 운영 기록](https://github.com/thanksstevenkim/mastodon-lab/blob/main/operations/korean-nori-search-development-and-ci-validation-2026-10-25.md)
- [PR #11 및 검증 이력](https://github.com/thanksstevenkim/mastodon-v2/pull/11)
- [병합 후 Nori 테스트 실행](https://github.com/thanksstevenkim/mastodon-v2/actions/runs/40176522692)
