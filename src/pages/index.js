import React from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import styles from './index.module.css';

const sections = [
  {title: '처음 설치하기', summary: '목적 정하기부터 첫날 점검까지 필요한 순서로 살펴보세요.', path: '/guide/getting-started/introduction'},
  {title: '서버 운영하기', summary: '백업, 업데이트, 가용성 감시와 미디어 캐시 관리를 확인하세요.', path: '/guide/operations/backup-readiness'},
  {title: '문제 해결하기', summary: 'Cloudflare 521, 컨테이너, 데이터베이스 등 흔한 장애를 구분하세요.', path: '/guide/troubleshooting/known-failures'},
  {title: '실험 기록', summary: '실제 VM 실험과 상세 검증 과정을 선택적으로 읽어보세요.', path: '/guide/labs/'},
];

export default function Home() {
  return (
    <Layout title="홈" description="마스토돈 서버 설치와 운영을 위한 비공식 한국어 핸드북">
      <main className={styles.main}>
        <div className="container">
          <header className={styles.header}>
            <p className={styles.eyebrow}>비공식 한국어 운영 안내서</p>
            <h1>마스토돈 서버 운영을 시작해 보세요</h1>
            <p>설치에 필요한 안내와 실제 운영 중 참고할 내용을 분리했습니다. 필요한 곳부터 읽어도 괜찮습니다.</p>
            <Link className="button button--primary button--lg" to="/guide/getting-started/introduction">처음부터 읽기</Link>
          </header>
          <div className={styles.grid}>
            {sections.map(({title, summary, path}) => (
              <Link className={styles.card} key={title} to={path}>
                <h2>{title}</h2>
                <p>{summary}</p>
              </Link>
            ))}
          </div>
          <p className={styles.note}>공식 Mastodon 문서의 번역본이 아닙니다. 운영 환경과 버전에 따라 절차가 달라질 수 있습니다.</p>
        </div>
      </main>
    </Layout>
  );
}
