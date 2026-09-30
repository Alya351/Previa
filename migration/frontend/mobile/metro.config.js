const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'react-native-webrtc') {
    return {
      filePath: path.resolve(__dirname, 'stubs/react-native-webrtc-web.js'),
      type: 'sourceFile',
    };
  }
  if (moduleName === 'react-native-zeroconf') {
    return {
      filePath: path.resolve(__dirname, 'stubs/react-native-zeroconf-web.js'),
      type: 'sourceFile',
    };
  }
  if (defaultResolveRequest) {
    return defaultResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
