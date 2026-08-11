import { CookingScreen } from "@/components/cooking/cooking-screen";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function RecipePage({ params }: Props) {
  const { id } = await params;
  return <CookingScreen recipeId={id} />;
}
