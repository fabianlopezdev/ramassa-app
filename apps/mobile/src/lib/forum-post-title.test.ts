import { describe, expect, test } from 'bun:test';
import { splitForumPostTitle } from './forum-post-title';

describe('a forum post on a photo card: first sentence as title, the rest as preview (RAPP-921)', () => {
  test('the title ends at the first full stop, exclamation or question mark', () => {
    expect(splitForumPostTitle('Benvingudes al fòrum! Aquest és un espai per ajudar-nos.')).toEqual(
      { title: 'Benvingudes al fòrum!', preview: 'Aquest és un espai per ajudar-nos.' },
    );
    expect(splitForumPostTitle('Qui ve dissabte? Portem pilotes.')).toEqual({
      title: 'Qui ve dissabte?',
      preview: 'Portem pilotes.',
    });
    expect(splitForumPostTitle('Hola. Bon dia')).toEqual({ title: 'Hola.', preview: 'Bon dia' });
  });

  test('a line break ends the title too', () => {
    expect(splitForumPostTitle('Entrenament nou\nDimarts a les 6')).toEqual({
      title: 'Entrenament nou',
      preview: 'Dimarts a les 6',
    });
  });

  test('a dot inside a word or a link does not end the title', () => {
    expect(splitForumPostTitle('Mireu ramassa.cat ara! Fins aviat')).toEqual({
      title: 'Mireu ramassa.cat ara!',
      preview: 'Fins aviat',
    });
  });

  test('the Arabic and Farsi question mark ends the title', () => {
    expect(splitForumPostTitle('هل تأتين؟ سنلعب غدا')).toEqual({
      title: 'هل تأتين؟',
      preview: 'سنلعب غدا',
    });
  });

  test('one sentence is a title alone, and no text is neither', () => {
    expect(splitForumPostTitle('Benvingudes al fòrum!')).toEqual({
      title: 'Benvingudes al fòrum!',
      preview: null,
    });
    expect(splitForumPostTitle('sense punt')).toEqual({ title: 'sense punt', preview: null });
    expect(splitForumPostTitle(null)).toEqual({ title: null, preview: null });
    expect(splitForumPostTitle('   ')).toEqual({ title: null, preview: null });
  });
});
