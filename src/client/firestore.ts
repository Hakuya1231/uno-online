import { getFirestore, type Firestore } from "firebase/firestore";
import { getClientFirebaseApp } from "@/client/firebase";

/**
 * 浏览器侧 Firestore（只用于订阅公开房间数据）。
 *
 * 注意：
 * - 这里只用于 read/onSnapshot；写操作仍通过服务端 API routes 做校验
 */
export function getClientFirestore(): Firestore {
  return getFirestore(getClientFirebaseApp());
}

