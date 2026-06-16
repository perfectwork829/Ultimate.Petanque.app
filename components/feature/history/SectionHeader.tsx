import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import theme from '@/constants/theme';

export const SectionHeader = React.memo(({ title }: { title: string }) => (
  <View style={styles.sectionHeader}>
    <View style={styles.sectionDot} />
    <Text style={styles.sectionTitle}>{title}</Text>
    <View style={styles.sectionLine} />
  </View>
));

const styles = StyleSheet.create({
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginTop: 8, marginBottom: 12 },
  sectionDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: theme.primary, marginRight: 8 },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: theme.textSecondary, textTransform: 'capitalize' },
  sectionLine: { flex: 1, height: 1, backgroundColor: theme.border, marginLeft: 10 },
});
