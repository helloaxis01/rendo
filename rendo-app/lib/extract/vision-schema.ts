import { SchemaType, type ResponseSchema } from "@google/generative-ai";
import { VISION_REQUIRED_FIELDS } from "@/lib/extract/schema";

const ingredientSchema: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    amount: {
      type: SchemaType.NUMBER,
      nullable: true,
      description: "Parsed quantity",
    },
    unit: {
      type: SchemaType.STRING,
      nullable: true,
      description: "Parsed unit",
    },
    name: { type: SchemaType.STRING, description: "Ingredient name" },
    section: {
      type: SchemaType.STRING,
      nullable: true,
      description: "Ingredient group heading when present (e.g. For the Salsa Verde)",
    },
    search_key: { type: SchemaType.STRING, nullable: true },
  },
  required: ["name"],
};

const stepSchema: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    step_number: { type: SchemaType.INTEGER },
    action_header: { type: SchemaType.STRING },
    instruction: {
      type: SchemaType.STRING,
      description: "One cooking direction in order",
    },
    timer_seconds: { type: SchemaType.INTEGER, nullable: true },
  },
  required: ["instruction"],
};

const recipeSchema: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    title: {
      type: SchemaType.STRING,
      description: "Name of the recipe",
    },
    source_account: {
      type: SchemaType.STRING,
      nullable: true,
      description: "Instagram handle/creator source name",
    },
    ingredients: {
      type: SchemaType.ARRAY,
      description: "Array of items with parsed quantities and units",
      items: ingredientSchema,
    },
    instructions: {
      type: SchemaType.ARRAY,
      description: "Sequential step-by-step directions",
      items: stepSchema,
    },
    prep_time: {
      type: SchemaType.INTEGER,
      nullable: true,
      description: "Extracted prep duration (if present)",
    },
    cook_time: {
      type: SchemaType.INTEGER,
      nullable: true,
      description: "Extracted cook duration (if present)",
    },
    servings: {
      type: SchemaType.NUMBER,
      nullable: true,
      description: "Parsed yield/yield count (if present)",
    },
    tags: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
    },
    subtitle: { type: SchemaType.STRING, nullable: true },
    source_url: { type: SchemaType.STRING, nullable: true },
    cover_image_url: { type: SchemaType.STRING, nullable: true },
    cover_fallback_label: { type: SchemaType.STRING, nullable: true },
  },
  required: [...VISION_REQUIRED_FIELDS],
};

/**
 * Gemini JSON mode schema: one recipe stitched from every attached frame.
 */
export const VISION_RESPONSE_SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    recipes: {
      type: SchemaType.ARRAY,
      minItems: 1,
      maxItems: 1,
      items: recipeSchema,
    },
  },
  required: ["recipes"],
};
