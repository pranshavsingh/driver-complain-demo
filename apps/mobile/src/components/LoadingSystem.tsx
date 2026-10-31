/* ==========================================================================
   SSE Connect+ Unified Loading System (Driver Mobile)
   Native Skeletons, Pulse Shimmer, Inline Spinners & Stable Loading Buttons
   ========================================================================== */

import { useEffect, useRef, type ReactElement } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import { colors, fontSize, radius, spacing } from '../theme';

// ---------------------------------------------------------------------------
// 1. Base Skeleton
// ---------------------------------------------------------------------------
export interface SkeletonProps {
  width?: number | `${number}%`;
  height?: number;
  borderRadius?: number;
  circle?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Skeleton({
  width = '100%',
  height = 16,
  borderRadius = 8,
  circle = false,
  style,
}: SkeletonProps): ReactElement {
  const opacity = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.85,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.35,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  const computedWidth = circle ? (typeof width === 'number' ? width : height) : width;
  const computedHeight = circle ? (typeof width === 'number' ? width : height) : height;
  const computedRadius = circle ? 9999 : borderRadius;

  return (
    <Animated.View
      style={[
        styles.skeletonBase,
        {
          width: computedWidth,
          height: computedHeight,
          borderRadius: computedRadius,
          opacity,
        },
        style,
      ]}
    />
  );
}

// ---------------------------------------------------------------------------
// 2. SkeletonText
// ---------------------------------------------------------------------------
export interface SkeletonTextProps {
  lines?: number;
  lineHeight?: number;
  gap?: number;
  widths?: (number | `${number}%`)[];
  style?: StyleProp<ViewStyle>;
}

export function SkeletonText({
  lines = 3,
  lineHeight = 14,
  gap = 8,
  widths,
  style,
}: SkeletonTextProps): ReactElement {
  const defaultWidths: (number | `${number}%`)[] = ['100%', '85%', '65%', '90%', '70%'];

  return (
    <View style={[{ gap }, style]}>
      {Array.from({ length: lines }).map((_, i) => {
        const w = widths && widths[i] !== undefined ? widths[i] : defaultWidths[i % defaultWidths.length];
        return (
          <Skeleton
            key={i}
            width={w}
            height={lineHeight}
            borderRadius={4}
          />
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// 3. SkeletonCircle
// ---------------------------------------------------------------------------
export function SkeletonCircle({
  size = 40,
  style,
}: {
  size?: number;
  style?: StyleProp<ViewStyle>;
}): ReactElement {
  return <Skeleton circle width={size} height={size} style={style} />;
}

// ---------------------------------------------------------------------------
// 4. SkeletonCard
// ---------------------------------------------------------------------------
export interface SkeletonCardProps {
  header?: boolean;
  lines?: number;
  footer?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

export function SkeletonCard({
  header = true,
  lines = 2,
  footer = false,
  style,
  children,
}: SkeletonCardProps): ReactElement {
  return (
    <View style={[styles.card, style]}>
      {children ? (
        children
      ) : (
        <>
          {header && (
            <View style={styles.cardHeader}>
              <Skeleton width="60%" height={18} borderRadius={6} />
              <Skeleton width={70} height={22} borderRadius={12} />
            </View>
          )}
          <SkeletonText lines={lines} lineHeight={14} gap={8} />
          {footer && (
            <View style={styles.cardFooter}>
              <Skeleton width={80} height={18} borderRadius={10} />
              <Skeleton width={110} height={12} />
            </View>
          )}
        </>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// 5. SkeletonList
// ---------------------------------------------------------------------------
export function SkeletonList({
  count = 4,
  cardLines = 2,
  style,
}: {
  count?: number;
  cardLines?: number;
  style?: StyleProp<ViewStyle>;
}): ReactElement {
  return (
    <View style={[styles.listContainer, style]}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} lines={cardLines} footer />
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// 6. InlineSpinner
// ---------------------------------------------------------------------------
export function InlineSpinner({
  size = 'small',
  color = colors.primary,
  style,
}: {
  size?: 'small' | 'large' | number;
  color?: string;
  style?: StyleProp<ViewStyle>;
}): ReactElement {
  return (
    <ActivityIndicator
      size={size}
      color={color}
      style={[styles.inlineSpinner, style]}
    />
  );
}

// ---------------------------------------------------------------------------
// 7. LoadingButton
// ---------------------------------------------------------------------------
export type ButtonVariant = 'primary' | 'secondary' | 'danger';

export interface LoadingButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  loadingText?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
}

export function LoadingButton({
  label,
  onPress,
  variant = 'primary',
  loading = false,
  loadingText,
  disabled = false,
  style,
  labelStyle,
}: LoadingButtonProps): ReactElement {
  const isDisabled = disabled || loading;
  const displayText = loading && loadingText ? loadingText : label;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={({ pressed }) => [
        styles.btnBase,
        variant === 'primary' && styles.btnPrimary,
        variant === 'secondary' && styles.btnSecondary,
        variant === 'danger' && styles.btnDanger,
        isDisabled && styles.btnDisabled,
        pressed && !isDisabled && styles.btnPressed,
        style,
      ]}
    >
      <View style={styles.btnContent}>
        {loading ? (
          <ActivityIndicator
            size="small"
            color={variant === 'secondary' ? colors.primary : colors.primaryText}
            style={styles.btnSpinner}
          />
        ) : null}
        <Text
          style={[
            styles.btnLabel,
            variant === 'secondary' ? styles.btnLabelSecondary : styles.btnLabelOnColor,
            labelStyle,
          ]}
        >
          {displayText}
        </Text>
      </View>
    </Pressable>
  );
}

// ===========================================================================
// SCREEN-SPECIFIC SKELETONS FOR MOBILE
// ===========================================================================

// ---------------------------------------------------------------------------
// A. Driver Dashboard Vehicle Card Skeleton
// ---------------------------------------------------------------------------
export function DriverVehicleCardSkeleton(): ReactElement {
  return (
    <View style={styles.driverVehicleCard}>
      <View style={styles.driverVehicleHeader}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <SkeletonCircle size={24} />
          <Skeleton width={140} height={20} borderRadius={6} />
        </View>
        <Skeleton width={88} height={22} borderRadius={11} />
      </View>
      <View style={{ marginTop: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Skeleton width="50%" height={16} />
        <Skeleton width={70} height={18} borderRadius={8} />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// B. ComplaintDetailSkeleton (Mobile Detail View)
// ---------------------------------------------------------------------------
export function ComplaintDetailSkeleton(): ReactElement {
  return (
    <View style={styles.detailContainer}>
      {/* Badges row */}
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
        <Skeleton width={80} height={24} borderRadius={12} />
        <Skeleton width={70} height={24} borderRadius={12} />
      </View>

      {/* Title & Description */}
      <Skeleton width="85%" height={24} style={{ marginBottom: 10 }} />
      <SkeletonText lines={3} lineHeight={16} gap={8} style={{ marginBottom: 20 }} />

      {/* Details Card */}
      <View style={styles.card}>
        <Skeleton width={100} height={16} style={{ marginBottom: 16 }} />
        <View style={{ gap: 14 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Skeleton width="30%" height={14} />
              <Skeleton width="50%" height={14} />
            </View>
          ))}
        </View>
      </View>

      {/* Evidence Placeholders */}
      <View style={styles.card}>
        <Skeleton width={90} height={16} style={{ marginBottom: 14 }} />
        <Skeleton width="100%" height={180} borderRadius={12} />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// C. Mobile Admin User Profile Skeleton
// ---------------------------------------------------------------------------
export function UserProfileSkeleton(): ReactElement {
  return (
    <View style={styles.detailContainer}>
      <View style={[styles.card, { alignItems: 'center', paddingVertical: 24 }]}>
        <SkeletonCircle size={64} style={{ marginBottom: 12 }} />
        <Skeleton width={160} height={22} style={{ marginBottom: 6 }} />
        <Skeleton width={100} height={14} style={{ marginBottom: 16 }} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Skeleton width={80} height={24} borderRadius={12} />
          <Skeleton width={90} height={24} borderRadius={12} />
        </View>
      </View>

      <View style={styles.card}>
        <Skeleton width={120} height={16} style={{ marginBottom: 14 }} />
        <View style={{ gap: 12 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Skeleton width="35%" height={14} />
              <Skeleton width="45%" height={14} />
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// D. Mobile Admin Vehicle Detail Skeleton
// ---------------------------------------------------------------------------
export function VehicleDetailSkeleton(): ReactElement {
  return (
    <View style={styles.detailContainer}>
      <View style={styles.card}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
          <Skeleton width={140} height={22} />
          <Skeleton width={70} height={22} borderRadius={11} />
        </View>
        <Skeleton width="60%" height={16} style={{ marginBottom: 16 }} />
        <View style={{ gap: 12 }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Skeleton width="35%" height={14} />
              <Skeleton width="50%" height={14} />
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// E. Mobile Admin Dashboard KPI Grid Skeleton
// ---------------------------------------------------------------------------
export function AdminKPIGridSkeleton(): ReactElement {
  return (
    <View style={{ gap: 12, paddingVertical: 8 }}>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={[styles.card, { flex: 1 }]}>
          <Skeleton width="60%" height={12} style={{ marginBottom: 8 }} />
          <Skeleton width={50} height={28} borderRadius={6} />
        </View>
        <View style={[styles.card, { flex: 1 }]}>
          <Skeleton width="60%" height={12} style={{ marginBottom: 8 }} />
          <Skeleton width={50} height={28} borderRadius={6} />
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={[styles.card, { flex: 1 }]}>
          <Skeleton width="60%" height={12} style={{ marginBottom: 8 }} />
          <Skeleton width={50} height={28} borderRadius={6} />
        </View>
        <View style={[styles.card, { flex: 1 }]}>
          <Skeleton width="60%" height={12} style={{ marginBottom: 8 }} />
          <Skeleton width={50} height={28} borderRadius={6} />
        </View>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Stylesheet
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  skeletonBase: {
    backgroundColor: '#CBD5E1',
  },
  listContainer: {
    gap: 12,
    paddingVertical: 8,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.md || 12,
    padding: spacing.lg || 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  inlineSpinner: {
    marginRight: 6,
  },
  btnBase: {
    minHeight: 56,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  btnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSpinner: {
    marginRight: spacing.sm,
  },
  btnPrimary: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  btnSecondary: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  btnDanger: {
    backgroundColor: colors.danger,
    borderColor: colors.danger,
  },
  btnDisabled: {
    backgroundColor: colors.primaryDisabled,
    borderColor: colors.primaryDisabled,
  },
  btnPressed: {
    opacity: 0.85,
  },
  btnLabel: {
    fontSize: fontSize.large,
    fontWeight: '600',
    textAlign: 'center',
  },
  btnLabelOnColor: {
    color: colors.primaryText,
  },
  btnLabelSecondary: {
    color: colors.primary,
  },
  driverVehicleCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
  },
  driverVehicleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailContainer: {
    padding: 16,
  },
});

