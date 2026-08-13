type Props = {
  params: Promise<{ id: string }>;
};

export default async function RecipePage({ params }: Props) {
  await params;
  return null;
}
