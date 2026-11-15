import React from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import styles from './styles.module.css';

const menus = {
  install: {
    title: '처음 설치하기',
    description: '운영을 시작하기 전부터 첫날 점검까지, 필요한 순서로 읽어보세요.',
    groups: [
      {
        title: '시작하기 전',
        items: [
          {title: '00 · 운영을 시작하기 전에', description: '운영 목적과 책임, 준비할 것을 먼저 생각해 봅니다.', to: '/guide/getting-started/introduction'},
          {title: '01 · 서버 구성 요소', description: '웹·작업 처리·데이터베이스가 어떤 역할을 하는지 알아봅니다.', to: '/guide/getting-started/architecture'},
          {title: '02 · 서버 준비', description: '운영체제, 보안, 용량과 비용을 점검합니다.', to: '/guide/getting-started/prerequisites'},
          {title: '03 · 도메인·HTTPS·메일', description: '계정 주소와 접속, 메일 발송을 준비합니다.', to: '/guide/getting-started/domain-and-dns'},
        ],
      },
      {
        title: '설치하고 점검하기',
        items: [
          {title: '04 · Docker Compose 이해하기', description: 'Mastodon을 구성하는 컨테이너를 이해합니다.', to: '/guide/getting-started/docker-compose'},
          {title: '05 · 최초 설치', description: '실제 설치에 필요한 절차를 따라갑니다.', to: '/guide/getting-started/initial-setup'},
          {title: '05B · 필수 보안 설정', description: '비밀번호와 비밀키를 안전하게 관리합니다.', to: '/guide/getting-started/05b-secure-configuration'},
          {title: '06 · 첫날 운영 점검', description: '설치 후 주요 기능을 확인합니다.', to: '/guide/getting-started/first-day-checklist'},
        ],
      },
    ],
  },
  operate: {
    title: '서버 운영하기',
    description: '이미 운영 중인 서버의 유지보수에 필요한 문서를 찾아보세요.',
    groups: [
      {
        title: '일상 관리',
        items: [
          {title: '백업·복원 준비', description: '어떤 데이터를 보호하고 어디까지 복구해야 하는지 확인합니다.', to: '/guide/operations/backup-readiness'},
          {title: 'Mastodon 업그레이드', description: '버전 변경 전후의 준비와 점검 기준을 살펴봅니다.', to: '/guide/operations/upgrade-checklist'},
          {title: 'Ubuntu 호스트 유지보수', description: '운영체제 업데이트와 재부팅을 관리합니다.', to: '/guide/operations/host-maintenance'},
          {title: '런타임·보안 패치', description: '필요한 변경만 제한적으로 적용하는 방법을 살펴봅니다.', to: '/guide/operations/security-patch-rollout'},
        ],
      },
      {
        title: '감시와 저장 공간',
        items: [
          {title: '웹사이트 가용성 감시', description: '접속 실패를 검사하고 알림을 받을 수 있도록 준비합니다.', to: '/guide/operations/uptime-monitoring'},
          {title: 'Sidekiq 정기 모니터링', description: '백그라운드 작업 처리 상태를 확인합니다.', to: '/guide/operations/sidekiq-monitoring'},
          {title: '원격 미디어 캐시 관리', description: '원격 미디어 저장 공간을 안전하게 관리합니다.', to: '/guide/operations/media-cache-maintenance'},
        ],
      },
    ],
  },
  problems: {
    title: '문제 해결하기',
    description: '증상을 먼저 구분한 뒤, 필요한 확인 지점으로 이동하세요.',
    groups: [
      {
        title: '증상별 안내',
        items: [
          {title: '서버 운영에서 자주 혼동하는 장애', description: '접속 장애와 컨테이너 상태 등 흔한 오류 원인을 구분합니다.', to: '/guide/troubleshooting/known-failures'},
          {title: 'Sidekiq 대기열 문제', description: '작업 적체, 처리 실패 등 백그라운드 작업 문제를 살펴봅니다.', to: '/guide/operations/sidekiq-queues'},
          {title: '백업·복원 준비', description: '장애나 복구 판단에 앞서 보존해야 할 데이터를 확인합니다.', to: '/guide/operations/backup-readiness'},
        ],
      },
    ],
  },
  more: {
    title: '보안·심화 자료',
    description: '선택 기능과 실제 검증 기록을 찾아볼 수 있습니다.',
    groups: [
      {
        title: '운영 주제',
        items: [
          {title: '가입 남용·연합 보호', description: '운영 정책과 남용 대응에 필요한 기준을 살펴봅니다.', to: '/guide/security/registration-and-federation'},
          {title: '한국어 검색 (Nori)', description: 'Elasticsearch 한국어 검색 확장에 관한 안내입니다.', to: '/guide/search/korean-nori'},
        ],
      },
      {
        title: '더 살펴보기',
        items: [
          {title: '실험·검증 기록 (Labs)', description: '설치 및 복원 과정의 상세 기록입니다. 입문자에게 필수는 아닙니다.', to: '/guide/labs/'},
          {title: '핸드북 전체 목차', description: '문서 전체를 한 화면에서 확인합니다.', to: '/guide/overview'},
        ],
      },
    ],
  },
};

export default function HandbookMenuPage({section}) {
  const menu = menus[section];
  return (
    <Layout title={menu.title} description={menu.description}>
      <main className={styles.main}>
        <div className="container">
          <Link className={styles.homeLink} to="/">← 홈으로</Link>
          <header className={styles.header}>
            <h1>{menu.title}</h1>
            <p>{menu.description}</p>
          </header>
          {menu.groups.map((group) => (
            <section className={styles.group} key={group.title}>
              <h2>{group.title}</h2>
              <div className={styles.grid}>
                {group.items.map((item) => (
                  <Link className={styles.linkCard} to={item.to} key={item.to}>
                    <span className={styles.linkText}>
                      <strong>{item.title}</strong>
                      <span>{item.description}</span>
                    </span>
                    <span className={styles.arrow} aria-hidden="true">→</span>
                  </Link>
                ))}
              </div>
            </section>
          ))}
          <p className={styles.note}>이곳의 문서는 비공식 한국어 안내서입니다. 사용 중인 환경과 버전에 맞게 적용하세요.</p>
        </div>
      </main>
    </Layout>
  );
}
