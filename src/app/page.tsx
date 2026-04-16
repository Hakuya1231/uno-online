import Link from "next/link";
import styles from "./page.module.css";

export default function Home() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <h1>UNO Online</h1>
        <p style={{ opacity: 0.8, marginTop: 0 }}>先登录，再创建房间。</p>
        <div className={styles.ctas}>
          <Link className={styles.primary} href="/login">
            去登录 / 创建房间
          </Link>
        </div>
      </main>
    </div>
  );
}
