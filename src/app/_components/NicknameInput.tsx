"use client";

import { useCallback } from "react";
import { randomChuunibyouNickname } from "@/client/nickname";
import { saveNickname } from "@/client/localSession";

export function NicknameInput(props: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  maxLen?: number;
}) {
  const maxLen = props.maxLen ?? 12;

  const onRandom = useCallback(() => {
    const nn = randomChuunibyouNickname({ maxLen });
    props.onChange(nn);
    saveNickname(nn);
  }, [maxLen, props]);

  return (
    <label style={{ display: "grid", gap: 6, maxWidth: 420 }}>
      <span>昵称</span>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={props.value}
          onChange={(e) => {
            props.onChange(e.target.value);
            saveNickname(e.target.value.trim());
          }}
          placeholder="请输入"
          maxLength={maxLen}
          disabled={props.disabled}
        />
        <button type="button" onClick={onRandom} disabled={props.disabled}>
          随机
        </button>
      </div>
    </label>
  );
}

