import type { Metadata } from "next";
import Workbench from "./components/Workbench";

export const metadata: Metadata = {
  title: "Better Workbench",
  description: "트렌드 근거부터 안전 검토와 발행, 고객 반응 재적용까지 이어지는 웰니스 MD 워크벤치"
};

export default function Home() {
  return <Workbench />;
}
