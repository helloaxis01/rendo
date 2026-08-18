import type { Metadata } from "next";

type Props = {
  params: Promise<{ id: string }>;
};

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default async function RecipePage({ params }: Props) {
  await params;
  return null;
}
