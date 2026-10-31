import type { ReactElement } from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { radius, spacing } from '../../theme';

export interface FilterOption<T = string> {
  id: T;
  label: string;
  count?: number;
}

interface FilterBarProps<T = string> {
  options: FilterOption<T>[];
  selectedId: T;
  onSelect: (id: T) => void;
}

export function FilterBar<T extends string = string>({
  options,
  selectedId,
  onSelect,
}: FilterBarProps<T>): ReactElement {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
    >
      {options.map((option) => {
        const isSelected = option.id === selectedId;
        return (
          <Pressable
            key={option.id}
            onPress={() => onSelect(option.id)}
            style={[styles.chip, isSelected && styles.chipSelected]}
          >
            <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
              {option.label}
            </Text>
            {option.count !== undefined && (
              <Text style={[styles.chipCount, isSelected && styles.chipCountSelected]}>
                {option.count}
              </Text>
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.xs + 2,
    flexDirection: 'row',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  chipSelected: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  chipTextSelected: {
    color: '#FFFFFF',
  },
  chipCount: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.pill,
  },
  chipCountSelected: {
    color: '#0F172A',
    backgroundColor: '#FFFFFF',
  },
});
