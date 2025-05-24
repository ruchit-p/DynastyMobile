module.exports = {
  requestPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  createAssetAsync: jest.fn(() => Promise.resolve({ id: 'asset-1' })),
  createAlbumAsync: jest.fn(() => Promise.resolve()),
  addAssetsToAlbumAsync: jest.fn(() => Promise.resolve()),
  getAlbumsAsync: jest.fn(() => Promise.resolve({ albums: [] })),
  getAssetsAsync: jest.fn(() => Promise.resolve({ assets: [] })),
};