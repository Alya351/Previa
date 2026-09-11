import React from 'react';
import { Image } from 'react-native';
import { RTCView } from 'react-native-webrtc';

// Équivalent mobile de frontend/web/src/components/FluxCamera.jsx :
// affiche le vrai flux vidéo WebRTC (voir lib/useFluxDirect.js) quand
// il est disponible (`stream`, un vrai MediaStream natif), sinon
// l'image de repli (`imageSource`, voir api.js/useImageEnDirect) —
// exactement le même principe des deux côtés, adapté à react-native-
// webrtc (`<RTCView streamURL={stream.toURL()}>` remplace
// `<video srcObject>`, qui n'existe pas sur mobile).
export function FluxCamera({ stream, imageSource, style }) {
  if (stream) {
    return (
      <RTCView
        streamURL={stream.toURL()}
        style={style}
        objectFit="cover"
      />
    );
  }

  return <Image source={imageSource} style={style} />;
}

export default FluxCamera;
