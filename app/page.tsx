import type { Metadata } from "next";
import Workbench from "./components/Workbench";

export const metadata: Metadata = {
  title: "Better Workbench",
  description: "트렌드 조사부터 안전 검토, 발행, 고객 반응 반영까지 이어지는 웰니스 MD 워크벤치"
};

export default function Home() {
  return <Workbench />;
}
