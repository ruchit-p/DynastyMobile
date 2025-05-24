describe('Simple Test', () => {
  it('should pass', () => {
    expect(1 + 1).toBe(2);
  });
  
  it('should handle arrays', () => {
    const arr = [1, 2, 3];
    expect(arr).toHaveLength(3);
    expect(arr).toContain(2);
  });
  
  it('should handle objects', () => {
    const obj = { name: 'Test', value: 42 };
    expect(obj).toHaveProperty('name', 'Test');
    expect(obj.value).toBe(42);
  });
});