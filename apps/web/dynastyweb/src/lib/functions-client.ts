import { Functions, httpsCallable, HttpsCallableResult } from 'firebase/functions';

/**
 * Options for Firebase function calls
 */
interface CallOptions {
  timeout?: number;
}

/**
 * Client for making Firebase Function calls
 * Simple wrapper around httpsCallable for consistency
 */
export class FirebaseFunctionsClient {
  constructor(private functions: Functions) {}

  /**
   * Call a Firebase Function
   * 
   * @param functionName Name of the Firebase Function to call
   * @param data Data to send to the function
   * @param options Call options
   * @returns Promise with the function result
   */
  async callFunction<TData = unknown, TResult = unknown>(
    functionName: string,
    data: TData,
    options: CallOptions = {}
  ): Promise<HttpsCallableResult<TResult>> {
    const { timeout } = options;
    
    // Create the callable function
    const callable = httpsCallable<TData, TResult>(this.functions, functionName, {
      timeout,
    });
    
    // Make the function call
    return await callable(data);
  }

  /**
   * Helper method to create a typed function caller
   * 
   * @param functionName Name of the Firebase Function
   * @returns A typed function that calls the Firebase Function
   */
  createTypedFunction<TData = unknown, TResult = unknown>(
    functionName: string
  ): (data: TData) => Promise<TResult> {
    return async (data: TData): Promise<TResult> => {
      const result = await this.callFunction<TData, TResult>(
        functionName,
        data
      );
      return result.data;
    };
  }

  /**
   * Batch call multiple Firebase Functions
   * 
   * @param calls Array of function calls to make
   * @returns Promise with array of results
   */
  async batchCall(
    calls: Array<{
      functionName: string;
      data: unknown;
      options?: CallOptions;
    }>
  ): Promise<HttpsCallableResult<unknown>[]> {
    return Promise.all(
      calls.map(({ functionName, data, options }) =>
        this.callFunction(functionName, data, options)
      )
    );
  }
}

/**
 * Create a Firebase Functions client
 * 
 * @param functions Firebase Functions instance
 * @returns FirebaseFunctionsClient instance
 */
export function createFirebaseClient(
  functions: Functions
): FirebaseFunctionsClient {
  return new FirebaseFunctionsClient(functions);
}