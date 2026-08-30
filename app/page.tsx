import type { Metadata } from "next";
import Link from "next/link";
import {
  chatGPTSignOutPath,
  getChatGPTUser,
  requireChatGPTUser
} from "./chatgpt-auth";
import Workbench from "./components/Workbench";
import { canUseWorkbench, isLocalOperatorBypassEnabled } from "@/lib/operator-auth";

export const metadata: Metadata = {
  title: "Better Workbench",
  description: "트렌드 조사부터 안전 검토, 발행, 고객 반응 반영까지 이어지는 웰니스 MD 워크벤치"
};

export default async function Home() {
  let user = await getChatGPTUser();
  if (!user && !isLocalOperatorBypassEnabled()) {
    user = await requireChatGPTUser("/");
  }

  if (!canUseWorkbench(user)) {
    return (
      <main className="operator-access">
        <span className="brand-mark">b.</span>
        <p>OPERATOR ACCESS</p>
        <h1>운영 권한이 필요한 화면입니다.</h1>
        <span>고객용 기획전은 누구나 볼 수 있지만, 생성과 발행은 등록된 MD 계정만 사용할 수 있습니다.</span>
        <div>
          <Link href="/shop">고객 화면 보기</Link>
          <a href={chatGPTSignOutPath("/")}>다른 계정으로 로그인</a>
        </div>
      </main>
    );
  }

  return <Workbench operatorName={user?.displayName ?? "로컬 개발자"} />;
}
