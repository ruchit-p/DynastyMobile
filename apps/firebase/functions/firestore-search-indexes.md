# Firestore Search Optimization Indexes

This document contains the Firestore composite indexes required for optimized search functionality.

## Stories Collection Indexes

Add these indexes to your `firestore.indexes.json` file or create them in the Firebase Console:

```json
{
  "indexes": [
    {
      "collectionGroup": "stories",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "familyTreeId", "order": "ASCENDING" },
        { "fieldPath": "isDeleted", "order": "ASCENDING" },
        { "fieldPath": "searchableTitle", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "stories",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "familyTreeId", "order": "ASCENDING" },
        { "fieldPath": "isDeleted", "order": "ASCENDING" },
        { "fieldPath": "searchableContent", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "stories",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "familyTreeId", "order": "ASCENDING" },
        { "fieldPath": "isDeleted", "order": "ASCENDING" },
        { "fieldPath": "searchKeywords", "order": "ASCENDING" }
      ]
    }
  ]
}
```

## Events Collection Indexes

Add these indexes for the events collection:

```json
{
  "indexes": [
    {
      "collectionGroup": "events",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "privacy", "order": "ASCENDING" },
        { "fieldPath": "searchableTitle", "order": "ASCENDING" },
        { "fieldPath": "eventDate", "order": "ASCENDING" },
        { "fieldPath": "id", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "events",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "privacy", "order": "ASCENDING" },
        { "fieldPath": "searchableDescription", "order": "ASCENDING" },
        { "fieldPath": "eventDate", "order": "ASCENDING" },
        { "fieldPath": "id", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "events",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "privacy", "order": "ASCENDING" },
        { "fieldPath": "searchableLocation", "order": "ASCENDING" },
        { "fieldPath": "eventDate", "order": "ASCENDING" },
        { "fieldPath": "id", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "events",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "privacy", "order": "ASCENDING" },
        { "fieldPath": "searchKeywords", "order": "ASCENDING" },
        { "fieldPath": "eventDate", "order": "ASCENDING" },
        { "fieldPath": "id", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "events",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "privacy", "order": "ASCENDING" },
        { "fieldPath": "familyTreeId", "order": "ASCENDING" },
        { "fieldPath": "searchableTitle", "order": "ASCENDING" },
        { "fieldPath": "eventDate", "order": "ASCENDING" },
        { "fieldPath": "id", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "events",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "privacy", "order": "ASCENDING" },
        { "fieldPath": "familyTreeId", "order": "ASCENDING" },
        { "fieldPath": "searchableDescription", "order": "ASCENDING" },
        { "fieldPath": "eventDate", "order": "ASCENDING" },
        { "fieldPath": "id", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "events",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "privacy", "order": "ASCENDING" },
        { "fieldPath": "familyTreeId", "order": "ASCENDING" },
        { "fieldPath": "searchableLocation", "order": "ASCENDING" },
        { "fieldPath": "eventDate", "order": "ASCENDING" },
        { "fieldPath": "id", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "events",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "privacy", "order": "ASCENDING" },
        { "fieldPath": "familyTreeId", "order": "ASCENDING" },
        { "fieldPath": "searchKeywords", "order": "ASCENDING" },
        { "fieldPath": "eventDate", "order": "ASCENDING" },
        { "fieldPath": "id", "order": "ASCENDING" }
      ]
    }
  ]
}
```

## Deployment Steps

1. **Deploy the index configuration:**

   ```bash
   firebase deploy --only firestore:indexes
   ```

2. **Run the migration to add searchable fields to existing documents:**

   ```bash
   # First, do a dry run to see what will be updated
   firebase functions:shell
   > addSearchableFields({ dryRun: true })

   # Then run the actual migration
   > addSearchableFields({ dryRun: false })
   ```

3. **Monitor index building:**
   - Go to Firebase Console > Firestore > Indexes
   - New indexes will show as "Building"
   - Wait for all indexes to show "Enabled" before using search

## Performance Improvements

With these optimizations:

- **searchStories**: From O(n) to O(log n + k) where k is the number of results
- **searchEvents**: From O(n) to O(log n + k) where k is the number of results
- No more in-memory filtering for text search
- Proper pagination support for search results
- Reduced document reads and bandwidth usage

## Notes

- Location-based filtering still requires in-memory filtering as Firestore doesn't support geospatial queries natively
- Consider using Firebase Extensions like "Search with Algolia" for more advanced search features
- The migration script only needs to be run once for existing documents
- New documents will automatically have searchable fields added
