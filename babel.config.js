module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      "babel-preset-expo"
    ],
    plugins: [
      [
        "module-resolver",
        {
          root: ["./"],
          alias: {
            'crypto': 'react-native-quick-crypto',
            'stream': 'readable-stream',
            'buffer': '@craftzdog/react-native-buffer',
            ui: "./packages/ui/src",
            utils: "./packages/utils/src",
            '@mobile': './apps/mobile/app'
          },
          extensions: [".js", ".jsx", ".ts", ".tsx", ".json"]
        }
      ]
    ]
  };
}; 