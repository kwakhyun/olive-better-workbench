import type { Metadata } from "next";
import Shop from "../components/Shop";

export const metadata: Metadata = {
  title: "건강한 아름다움을 일상으로",
  description: "지금 주목받는 트렌드와 안전 기준으로 엄선한 웰니스 기획전"
};

export default function ShopPage() {
  return <Shop />;
}
