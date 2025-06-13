// Examples of how to use the Firestore helper functions in your components
import { getDocument, getDocuments, createDocument, updateDocument, deleteDocument } from './firebase';
import { logger } from '../services/LoggingService';

// Example 1: Get a user document
// Instead of: db.collection('users').doc(userId).get()
// Use:
const getUserData = async (userId: string) => {
  try {
    const userDoc = await getDocument('users', userId);
    
    if (userDoc.exists) {
      return userDoc.data();
    } else {
      logger.debug('User document not found');
      return null;
    }
  } catch (error) {
    logger.error('Error getting user document:', error);
    throw error;
  }
};

// Example 2: Query for documents
// Instead of: db.collection('posts').where('authorId', '==', userId).get()
// Use:
const getUserPosts = async (userId: string) => {
  try {
    const postsQuery = await getDocuments('posts', [
      { field: 'authorId', operator: '==', value: userId }
    ]);
    
    return postsQuery.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    logger.error('Error getting user posts:', error);
    throw error;
  }
};

// Example 3: Create a new document
// Instead of: db.collection('comments').add({ ... })
// Use:
const addComment = async (postId: string, userId: string, text: string) => {
  try {
    const commentData = {
      postId,
      authorId: userId,
      text,
      createdAt: new Date()
    };
    
    const commentRef = await createDocument('comments', commentData);
    return commentRef.id;
  } catch (error) {
    logger.error('Error adding comment:', error);
    throw error;
  }
};

// Example 4: Update a document
// Instead of: db.collection('users').doc(userId).update({ ... })
// Use:
const updateUserProfile = async (userId: string, profileData: any) => {
  try {
    await updateDocument('users', userId, {
      ...profileData,
      updatedAt: new Date()
    });
    
    return true;
  } catch (error) {
    logger.error('Error updating user profile:', error);
    throw error;
  }
};

// Example 5: Delete a document
// Instead of: db.collection('posts').doc(postId).delete()
// Use:
const deletePost = async (postId: string) => {
  try {
    await deleteDocument('posts', postId);
    return true;
  } catch (error) {
    logger.error('Error deleting post:', error);
    throw error;
  }
};

// Export the examples for reference
export {
  getUserData,
  getUserPosts,
  addComment,
  updateUserProfile,
  deletePost
};