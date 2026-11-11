module.exports = {
  presets: [['babel-preset-expo']],
  env: {
    production: {
      plugins: ['react-native-paper/babel'],
    },
  },
  plugins: [
    ['module:react-native-dotenv'],
    [
      'babel-plugin-inline-import',
      {
        extensions: ['.md', '.txt'],
      },
    ],
  ],
};
