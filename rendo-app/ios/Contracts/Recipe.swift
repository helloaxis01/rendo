//
//  Recipe.swift
//  RENDO Contracts — mirrors web Zod RecipeSchema for future SwiftData port
//

import Foundation

struct IngredientNormalized: Codable, Identifiable, Hashable {
    var id: String
    var amount: Double?
    var unit: String?
    var name: String
    var searchKey: String
    var checked: Bool?

    enum CodingKeys: String, CodingKey {
        case id, amount, unit, name
        case searchKey = "search_key"
        case checked
    }
}

struct RecipeStep: Codable, Identifiable, Hashable {
    var id: Int { stepNumber }
    var stepNumber: Int
    var actionHeader: String
    var instruction: String
    var timerSeconds: Int?

    enum CodingKeys: String, CodingKey {
        case stepNumber = "step_number"
        case actionHeader = "action_header"
        case instruction
        case timerSeconds = "timer_seconds"
    }
}

struct KitchenNote: Codable, Identifiable, Hashable {
    var id: String
    var text: String
    var createdAt: String

    enum CodingKeys: String, CodingKey {
        case id, text
        case createdAt = "created_at"
    }
}

struct Recipe: Codable, Identifiable, Hashable {
    var id: String
    var title: String
    var sourceHandle: String?
    var sourceUrl: String?
    var prepTimeMinutes: Int
    var servingsBase: Double
    var coverImageUrl: String?
    var coverFallbackLabel: String?
    var isFavorite: Bool
    var tags: [String]
    var ingredientsNormalized: [IngredientNormalized]
    var steps: [RecipeStep]
    var kitchenNotes: [KitchenNote]
    var createdAt: String
    var updatedAt: String
    var lastOpenedAt: String?

    enum CodingKeys: String, CodingKey {
        case id, title, tags, steps
        case sourceHandle = "source_handle"
        case sourceUrl = "source_url"
        case prepTimeMinutes = "prep_time_minutes"
        case servingsBase = "servings_base"
        case coverImageUrl = "cover_image_url"
        case coverFallbackLabel = "cover_fallback_label"
        case isFavorite = "is_favorite"
        case ingredientsNormalized = "ingredients_normalized"
        case kitchenNotes = "kitchen_notes"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
        case lastOpenedAt = "last_opened_at"
    }
}

struct ExtractResponse: Codable {
    var recipes: [Recipe]
}
