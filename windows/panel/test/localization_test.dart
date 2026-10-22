import 'package:flutter_test/flutter_test.dart';
import 'package:xskin/localization.dart';

void main() {
  test('Mac interface messages cover all four Windows languages', () {
    expect(languages.keys, ['en', 'zh-Hant', 'zh-Hans', 'ja']);
    for (final row in translations.entries) {
      expect(row.value.length, 4, reason: row.key);
      for (final language in languages.keys) {
        expect(
          localizedText(row.key, language).trim(),
          isNotEmpty,
          reason: '${row.key}/$language',
        );
      }
    }
    for (final language in languages.keys) {
      expect(localizedText('autostartHint', language), contains('Codex'));
      expect(localizedText('autostartHint', language), isNot(contains('reopens')));
      expect(localizedText('autostartEnabled', language), contains('Codex'));
    }
  });
}
