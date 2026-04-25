"use client";

import "animal-island-ui/style";

import { useState } from "react";
import { Button, Card, Divider, Input, Modal, Switch, Time } from "animal-island-ui";

import styles from "./page.module.css";

export default function AnimalIslandUiLabPage() {
  const [nickname, setNickname] = useState("岛民阿布");
  const [ready, setReady] = useState(true);
  const [open, setOpen] = useState(false);

  return (
    <div className={styles.page}>
      <main className={styles.shell}>
        <header className={styles.header}>
          <span className={styles.eyebrow}>UI LAB</span>
          <h1>Animal Island UI 最小接入验证</h1>
          <p>
            这个页面只用来确认它在当前项目的 Next 16 + React 19 环境里能否正常编译、渲染和交互。
            现有房间与对局流程没有接管这套样式。
          </p>
        </header>

        <Divider type="wave-yellow" />

        <section className={styles.grid}>
          <Card color="app-blue" className={styles.stack}>
            <h2>基础组件</h2>
            <p className={styles.small}>验证按钮、输入框、开关和时间组件是否能在当前页面正常显示。</p>

            <div className={styles.inputRow}>
              <Input
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="输入你的岛民昵称"
                allowClear
                onClear={() => setNickname("")}
              />
              <div className={styles.row}>
                <Switch
                  checked={ready}
                  onChange={setReady}
                  checkedChildren="准备好了"
                  unCheckedChildren="再等等"
                />
                <Time />
              </div>
            </div>

            <div className={styles.row}>
              <Button type="primary" onClick={() => setOpen(true)}>
                打开弹窗
              </Button>
              <Button type="default">默认按钮</Button>
              <Button type="dashed">虚线按钮</Button>
            </div>
          </Card>

          <Card color="app-yellow" className={styles.stack}>
            <h2>当前验证结论</h2>
            <p className={styles.small}>如果你能看到这块卡片的圆角、配色、字体风格和控件样式，说明最小接入已经成功。</p>
            <div className={styles.stack}>
              <p>昵称预览：{nickname || "未填写"}</p>
              <p>准备状态：{ready ? "已开启" : "未开启"}</p>
              <p>验证范围：样式注入、客户端交互、Next 构建兼容性。</p>
            </div>
          </Card>
        </section>

        <div className={styles.footer}>
          <a className={styles.link} href="/">
            返回首页
          </a>
          <span className={styles.small}>验证页路由：/ui-lab/animal-island</span>
        </div>

        <Modal
          open={open}
          title="接入成功"
          onClose={() => setOpen(false)}
          onOk={() => setOpen(false)}
        >
          <p>Animal Island UI 已经能在这个项目里正常渲染。</p>
          <p>下一步就可以挑首页、房间页或对局页做定向替换了。</p>
        </Modal>
      </main>
    </div>
  );
}
