"use client";
import dynamic from "next/dynamic";
const Desktop = dynamic(() => import("@/components/Desktop"), { ssr: false });
export default function Home() {
  return <Desktop />;
}
