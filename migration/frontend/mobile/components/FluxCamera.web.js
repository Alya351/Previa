import React from 'react';
import { Image, View } from 'react-native';

export function FluxCamera({ stream, imageSource, style }) {
  if (stream) {
    return (
      <View style={[{ overflow: 'hidden' }, style]}>
        <video
          autoPlay
          playsInline
          muted
          ref={(el) => {
            if (el && stream && el.srcObject !== stream) {
              el.srcObject = stream;
            }
          }}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </View>
    );
  }

  return <Image source={imageSource} style={style} />;
}

export default FluxCamera;
