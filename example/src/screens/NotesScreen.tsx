import React, { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Database, eq, useDatabaseReady, useQuery } from '@salve-software/react-native-salve-db';
import { NoteSchema } from '../schemas/NoteSchema';
import { formatTimestamp } from '../library/formatTimestamp';

const ACCENT = '#5B5FEF';

export function NotesScreen(): React.JSX.Element {
  const { isReady, isLoading, error } = useDatabaseReady();
  const [title, setTitle] = useState('');

  const { data: notes, error: queryError } = useQuery({
    schema: NoteSchema,
    queryFn: (q) => q.orderBy('createdAt', 'desc').limit(50),
  });

  function addNote() {
    const trimmed = title.trim();
    if (!trimmed) return;
    Database.insert(NoteSchema)
      .values({ id: Date.now(), title: trimmed, createdAt: Date.now() })
      .execute();
    setTitle('');
  }

  function removeNote(id: number) {
    Database.delete(NoteSchema).where(eq('id', id)).execute();
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F4F5FA" />

      <View style={styles.header}>
        <Text style={styles.title}>Notes</Text>
        <Text style={styles.subtitle}>
          {isReady ? `${notes?.length ?? 0} saved · powered by Salve DB` : 'Starting database…'}
        </Text>
      </View>

      {!isReady ? (
        <View style={styles.centered}>
          {isLoading ? <ActivityIndicator color={ACCENT} size="large" /> : null}
          {error ? <Text style={styles.errorText}>Failed to start database: {String(error)}</Text> : null}
        </View>
      ) : (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 96 : 0}
        >
          {queryError ? <Text style={styles.errorText}>Query failed: {String(queryError)}</Text> : null}

          <FlatList
            data={notes ?? []}
            keyExtractor={(note) => String(note.id)}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <View style={styles.card}>
                <View style={styles.cardBody}>
                  <Text style={styles.cardTitle}>{item.title}</Text>
                  <Text style={styles.cardTimestamp}>{formatTimestamp(item.createdAt)}</Text>
                </View>
                <Pressable onPress={() => removeNote(item.id)} hitSlop={12} style={styles.deleteButton}>
                  <Text style={styles.deleteButtonText}>✕</Text>
                </Pressable>
              </View>
            )}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={styles.emptyEmoji}>📝</Text>
                <Text style={styles.emptyText}>No notes yet — add your first one below.</Text>
              </View>
            }
          />

          <View style={styles.composer}>
            <TextInput
              style={styles.input}
              placeholder="Write a note…"
              placeholderTextColor="#9B9DB8"
              value={title}
              onChangeText={setTitle}
              onSubmitEditing={addNote}
              returnKeyType="done"
            />
            <Pressable
              onPress={addNote}
              disabled={!title.trim()}
              style={({ pressed }) => [
                styles.addButton,
                !title.trim() && styles.addButtonDisabled,
                pressed && title.trim() ? styles.addButtonPressed : null,
              ]}
            >
              <Text style={styles.addButtonText}>+</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F4F5FA',
  },
  flex: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#1C1D3E',
    letterSpacing: -0.5,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 14,
    color: '#8A8CA8',
    fontWeight: '500',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    flexGrow: 1,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 18,
    marginBottom: 12,
    shadowColor: '#2B2D6B',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  cardBody: {
    flex: 1,
    marginRight: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1C1D3E',
  },
  cardTimestamp: {
    marginTop: 4,
    fontSize: 12,
    color: '#A6A8C4',
    fontWeight: '500',
  },
  deleteButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F4F5FA',
  },
  deleteButtonText: {
    fontSize: 13,
    color: '#B4B6D0',
    fontWeight: '700',
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    gap: 8,
  },
  emptyEmoji: {
    fontSize: 40,
  },
  emptyText: {
    fontSize: 14,
    color: '#9B9DB8',
    fontWeight: '500',
    textAlign: 'center',
  },
  errorText: {
    marginHorizontal: 20,
    marginBottom: 8,
    fontSize: 13,
    color: '#E14F62',
    fontWeight: '500',
    textAlign: 'center',
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 14,
    backgroundColor: '#F4F5FA',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E1E2F0',
  },
  input: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    paddingHorizontal: 20,
    backgroundColor: '#FFFFFF',
    fontSize: 15,
    color: '#1C1D3E',
    shadowColor: '#2B2D6B',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  addButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ACCENT,
  },
  addButtonPressed: {
    opacity: 0.85,
  },
  addButtonDisabled: {
    backgroundColor: '#C6C7E8',
  },
  addButtonText: {
    fontSize: 22,
    lineHeight: 24,
    color: '#FFFFFF',
    fontWeight: '600',
  },
});
