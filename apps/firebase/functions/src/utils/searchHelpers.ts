/**
 * Search helper utilities for optimizing Firestore text search
 */

/**
 * Normalizes text for searchable fields by converting to lowercase,
 * removing special characters, and trimming whitespace
 */
export function normalizeSearchText(text: string): string {
  if (!text) return '';

  return text
    .toLowerCase()
    .normalize('NFD') // Normalize unicode characters
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .replace(/[^a-z0-9\s]/g, ' ') // Replace special chars with spaces
    .replace(/\s+/g, ' ') // Collapse multiple spaces
    .trim();
}

/**
 * Extracts keywords from text for better search indexing
 * Returns an array of unique keywords (3+ characters)
 */
export function extractKeywords(text: string): string[] {
  if (!text) return [];

  const normalized = normalizeSearchText(text);
  const words = normalized.split(' ');

  // Filter out short words and create unique set
  const keywords = new Set<string>();

  words.forEach(word => {
    if (word.length >= 3) {
      keywords.add(word);

      // Also add progressive substrings for prefix matching
      // e.g., "family" -> ["fam", "fami", "famil", "family"]
      for (let i = 3; i <= word.length; i++) {
        keywords.add(word.substring(0, i));
      }
    }
  });

  return Array.from(keywords);
}

/**
 * Creates searchable fields for a document
 */
export interface SearchableFields {
  searchableTitle?: string;
  searchableContent?: string;
  searchableDescription?: string;
  searchableLocation?: string;
  searchKeywords?: string[];
}

/**
 * Generates searchable fields for stories
 */
export function generateStorySearchFields(
  title: string,
  subtitle?: string,
  blocks?: Array<{ type: string; data: any }>
): SearchableFields {
  const fields: SearchableFields = {};

  // Searchable title
  if (title) {
    fields.searchableTitle = normalizeSearchText(title);
  }

  // Extract text content from blocks
  let contentText = '';
  if (subtitle) {
    contentText += subtitle + ' ';
  }

  if (blocks && Array.isArray(blocks)) {
    blocks.forEach(block => {
      if (block.type === 'text' && block.data) {
        contentText += block.data + ' ';
      }
    });
  }

  if (contentText) {
    fields.searchableContent = normalizeSearchText(contentText);
  }

  // Generate keywords from title and content
  const allText = `${title || ''} ${subtitle || ''} ${contentText}`;
  fields.searchKeywords = extractKeywords(allText);

  return fields;
}

/**
 * Generates searchable fields for events
 */
export function generateEventSearchFields(
  title: string,
  description?: string,
  locationAddress?: string
): SearchableFields {
  const fields: SearchableFields = {};

  // Searchable title
  if (title) {
    fields.searchableTitle = normalizeSearchText(title);
  }

  // Searchable description
  if (description) {
    fields.searchableDescription = normalizeSearchText(description);
  }

  // Searchable location
  if (locationAddress) {
    fields.searchableLocation = normalizeSearchText(locationAddress);
  }

  // Generate keywords from all text
  const allText = `${title || ''} ${description || ''} ${locationAddress || ''}`;
  fields.searchKeywords = extractKeywords(allText);

  return fields;
}
