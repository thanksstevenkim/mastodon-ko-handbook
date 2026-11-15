import React from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import styles from './index.module.css';

const audiencePaths = [
  {
    eyebrow: '처음 설치하는 분',
    title: '서버를 처음 만들고 있어요',
    summary: '운영할 준비가 되었는지 생각하고, 구성 요소부터 첫날 점검까지 순서대로 살펴보세요.',
    steps: '운영 전 고려사항 → 서버 준비 → 설치 → 첫날 점검',
    action: '설치 안내 시작하기',
    path: '/menu/install',
  },
  {
    eyebrow: '이미 운영 중인 분',
    title: '운영 중 필요한 내용을 찾고 있어요',
    summary: '백업, 업데이트, 모니터링 등 일상적인 관리와 장애 대응에 필요한 문서를 찾아보세요.',
    steps: '백업·복원 → 업데이트 → 모니터링 → 문제 해결',
    action: '운영 안내 살펴보기',
    path: '/menu/operate',
  },
];

const quickLinks = [
  {
    title: '백업과 복원 준비',
    summary: '백업 대상과 복구 확인 범위를 점검할 때',
    path: '/guide/operations/backup-readiness',
  },
  {
    title: '웹사이트 장애 확인',
    summary: '접속 실패나 Cloudflare 521 등의 원인을 구분할 때',
    path: '/guide/troubleshooting/known-failures',
  },
  {
    title: '웹사이트 상태 감시',
    summary: 'HTTP 점검 및 장애 알림 체계를 마련할 때',
    path: '/guide/operations/uptime-monitoring',
  },
];

export default function Home() {
  return (
    <Layout title="홈" description="마스토돈 서버 설치와 운영을 위한 비공식 한국어 핸드북">
      <main className={styles.main}>
        <div className="container">
          <header className={styles.header}>
            <p className={styles.eyebrow}>마스토돈 한국어 운영 핸드북</p>
            <h1>필요한 곳부터 시작하세요.</h1>
            <p className={styles.lead}>
              처음 설치하는 분을 위한 단계별 안내와, 이미 서버를 운영하는 분을 위한 실무 자료를 나누어 정리했습니다.
            </p>
          </header>

          <section className={styles.section} aria-labelledby="audience-heading">
            <h2 className={styles.sectionTitle} id="audience-heading">어떤 상황에서 방문했나요?</h2>
            <div className={styles.audienceGrid}>
              {audiencePaths.map(({eyebrow, title, summary, steps, action, path}) => (
                <Link className={styles.audienceCard} key={title} to={path}>
                  <span className={styles.cardEyebrow}>{eyebrow}</span>
                  <h3>{title}</h3>
                  <p>{summary}</p>
                  <span className={styles.steps}>{steps}</span>
                  <span className={styles.cardAction}>{action} <span aria-hidden="true">→</span></span>
                </Link>
              ))}
            </div>
          </section>

          <section className={styles.section} aria-labelledby="quick-heading">
            <div className={styles.sectionHeading}>
              <h2 className={styles.sectionTitle} id="quick-heading">자주 찾는 운영 문서</h2>
              <Link className={styles.allGuides} to="/guide/overview">전체 목차 보기 <span aria-hidden="true">→</span></Link>
            </div>
            <div className={styles.quickGrid}>
              {quickLinks.map(({title, summary, path}) => (
                <Link className={styles.quickCard} key={title} to={path}>
                  <h3>{title}</h3>
                  <p>{summary}</p>
                </Link>
              ))}
            </div>
          </section>

          <aside className={styles.labNote}>
            <p><strong>실험 기록은 선택 자료입니다.</strong> 상세 VM 실험과 검증 과정은 <Link to="/guide/labs/">Labs</Link>에서 따로 볼 수 있습니다. 처음 설치할 때 모든 과정을 따라 할 필요는 없습니다.</p>
          </aside>

          <p className={styles.disclaimer}>
            이 사이트는 비공식 한국어 안내서이며, Mastodon 공식 문서의 번역본이 아닙니다. 실제 환경과 버전에 따라 절차가 달라질 수 있습니다.
          </p>
        </div>
      </main>
    </Layout>
  );
}
