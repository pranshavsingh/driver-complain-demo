import { useEffect, useMemo, useState, type ReactElement } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as api from '../../../src/api/endpoints';
import { useAuth } from '../../../src/auth/AuthContext';
import { useApiResource } from '../../../src/hooks/useApiResource';
import { AdminHeader } from '../../../src/components/admin/AdminHeader';
import { radius, spacing } from '../../../src/theme';
import { SkeletonList } from '../../../src/components/LoadingSystem';

export default function SupportChatAdminScreen(): ReactElement {
  const { user } = useAuth();
  const [selectedDriver, setSelectedDriver] = useState<any>(null);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<any[]>([]);

  const convResource = useApiResource('admin:support:convs', () =>
    api.support.getConversations().catch(() => [])
  );

  const conversations = useMemo(() => {
    return Array.isArray(convResource.data) ? convResource.data : [];
  }, [convResource.data]);

  // Load messages for selected driver
  useEffect(() => {
    if (!selectedDriver) return;
    let active = true;

    const load = async () => {
      try {
        const res = await api.support.getMessages(selectedDriver.id || selectedDriver.otherUserId);
        if (active && res && Array.isArray(res.data)) {
          setMessages(res.data);
          void api.support.markRead(selectedDriver.id || selectedDriver.otherUserId);
        }
      } catch {
        // Drop message fetch errors silently
      }
    };

    void load();
    const interval = setInterval(load, 5000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [selectedDriver]);

  const handleSend = async (): Promise<void> => {
    if (!selectedDriver || !inputText.trim() || sending) return;
    const text = inputText.trim();
    setInputText('');
    setSending(true);

    const tempMsg = {
      id: `temp-${Date.now()}`,
      senderId: user?.id,
      content: text,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [tempMsg, ...prev]);

    try {
      await api.support.sendMessage({
        receiverId: selectedDriver.id || selectedDriver.otherUserId,
        content: text,
        type: 'TEXT',
      });
    } catch {
      // Revert or retry
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={styles.screen}>
      <AdminHeader
        title={selectedDriver ? `${selectedDriver.name || selectedDriver.firstName || 'Driver'}` : 'Helpline Support'}
        subtitle={selectedDriver ? 'Direct 2-way dispatch channel' : `${conversations.length} active threads`}
        showBack
        onBack={selectedDriver ? () => setSelectedDriver(null) : undefined}
      />

      {!selectedDriver ? (
        // Conversations list
        <FlatList
          data={conversations}
          keyExtractor={(item, idx) => item.id || String(idx)}
          contentContainerStyle={styles.listContent}
          refreshing={convResource.loading}
          onRefresh={() => convResource.reload()}
          ListEmptyComponent={
            convResource.loading && convResource.data === null ? (
              <SkeletonList count={4} />
            ) : (
              <View style={styles.centerLoading}>
                <Ionicons name="chatbubbles-outline" size={48} color="#94A3B8" />
                <Text style={styles.emptyTitle}>No active driver inquiries</Text>
                <Text style={styles.emptySub}>
                  Drivers who initiate support chat will appear in this dispatch queue.
                </Text>
              </View>
            )
          }
          renderItem={({ item }) => (
            <Pressable
              style={styles.convCard}
              onPress={() => setSelectedDriver(item)}
            >
              <View style={styles.avatar}>
                <Ionicons name="person" size={20} color="#0F172A" />
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.convTopRow}>
                  <Text style={styles.convName}>
                    {item.name || item.firstName || 'Fleet Driver'}
                  </Text>
                  {item.lastMessageAt && (
                    <Text style={styles.convTime}>
                      {new Date(item.lastMessageAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Text>
                  )}
                </View>
                <Text style={styles.lastMsg} numberOfLines={1}>
                  {item.lastMessage || 'Tap to open chat thread...'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#94A3B8" />
            </Pressable>
          )}
        />
      ) : (
        // Chat Thread
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <FlatList
            data={messages}
            inverted
            keyExtractor={(item, idx) => item.id || String(idx)}
            contentContainerStyle={styles.chatContent}
            renderItem={({ item }) => {
              const isMine = item.senderId === user?.id;
              return (
                <View
                  style={[
                    styles.msgBubble,
                    isMine ? styles.msgMine : styles.msgOther,
                  ]}
                >
                  <Text style={[styles.msgText, isMine && styles.msgTextMine]}>
                    {item.content}
                  </Text>
                  <Text style={[styles.msgTime, isMine && styles.msgTimeMine]}>
                    {new Date(item.createdAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                </View>
              );
            }}
          />

          <View style={styles.inputBar}>
            <TextInput
              style={styles.inputField}
              placeholder="Type dispatch response..."
              placeholderTextColor="#94A3B8"
              value={inputText}
              onChangeText={setInputText}
            />
            <Pressable
              style={[
                styles.sendBtn,
                !inputText.trim() && { opacity: 0.5 },
              ]}
              onPress={handleSend}
              disabled={!inputText.trim() || sending}
            >
              <Ionicons name="send" size={18} color="#FFFFFF" />
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  listContent: { padding: spacing.md, paddingBottom: spacing.xxl },
  convCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  convTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  convName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  convTime: {
    fontSize: 11,
    color: '#94A3B8',
  },
  lastMsg: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  centerLoading: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
    gap: spacing.sm,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#334155',
  },
  emptySub: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    maxWidth: 260,
  },
  chatContent: {
    padding: spacing.md,
    paddingBottom: spacing.sm,
  },
  msgBubble: {
    maxWidth: '80%',
    padding: spacing.sm + 2,
    borderRadius: radius.md,
    marginBottom: spacing.xs + 2,
  },
  msgMine: {
    alignSelf: 'flex-end',
    backgroundColor: '#0F172A',
    borderBottomRightRadius: 2,
  },
  msgOther: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 2,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  msgText: {
    fontSize: 13,
    color: '#0F172A',
    lineHeight: 18,
  },
  msgTextMine: {
    color: '#FFFFFF',
  },
  msgTime: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 3,
    alignSelf: 'flex-end',
  },
  msgTimeMine: {
    color: '#94A3B8',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    gap: spacing.sm,
  },
  inputField: {
    flex: 1,
    height: 42,
    backgroundColor: '#F8FAFC',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    fontSize: 13,
    color: '#0F172A',
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
