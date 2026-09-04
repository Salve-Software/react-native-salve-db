import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors } from '../../theme/tokens';

export function Divider(): React.JSX.Element {
  return <View style={styles.line} />;
}

const styles = StyleSheet.create({
  line: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line },
});
