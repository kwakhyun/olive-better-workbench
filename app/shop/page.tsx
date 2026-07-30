import type { Metadata } from "next";
import Shop from "../components/Shop";

export const metadata: Metadata = {
  title: "건강한 아름다움을 일상 가까이",
  description: "현재의 관심 신호와 안전 기준으로 엄선한 웰니스 기획전"
};

export default function ShopPage() {
  return <Shop />;
}
