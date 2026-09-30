import React from 'react';
import { View } from 'react-native';

export const RTCView = ({ style, ...props }) => <View style={style} {...props} />;
export const RTCPeerConnection = typeof window !== 'undefined' ? (window.RTCPeerConnection || null) : null;
export const RTCIceCandidate = typeof window !== 'undefined' ? (window.RTCIceCandidate || null) : null;
export const RTCSessionDescription = typeof window !== 'undefined' ? (window.RTCSessionDescription || null) : null;
export const MediaStream = typeof window !== 'undefined' ? (window.MediaStream || null) : null;

export default {
  RTCView,
  RTCPeerConnection,
  RTCIceCandidate,
  RTCSessionDescription,
  MediaStream,
};
