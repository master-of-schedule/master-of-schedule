import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HelpPage } from './HelpPage';
import styles from './HelpPage.module.css';

describe('HelpPage', () => {
  it('renders inside its own scroll container', () => {
    render(<HelpPage />);

    const scrollArea = screen.getByTestId('help-scroll-area');
    expect(scrollArea).toHaveClass(styles.scrollArea);
    expect(screen.getByRole('heading', { name: 'Редактор школьного расписания' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Горячие клавиши' })).toBeInTheDocument();
  });
});
