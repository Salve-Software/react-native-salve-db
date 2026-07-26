import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TableSettingsModal } from '../index';

describe('TableSettingsModal', () => {
  it('renders nothing when there is no table', () => {
    const { container } = render(
      <TableSettingsModal table={null} isSystem={false} onTruncate={vi.fn()} onDelete={vi.fn()} onClose={vi.fn()} />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('shows the table name and both actions for a regular table', () => {
    render(
      <TableSettingsModal table="users" isSystem={false} onTruncate={vi.fn()} onDelete={vi.fn()} onClose={vi.fn()} />
    );

    expect(screen.getByText('users')).toBeInTheDocument();
    expect(screen.getByText('Truncate table')).toBeInTheDocument();
    expect(screen.getByText('Delete table')).toBeInTheDocument();
  });

  it('hides the delete action for an internal (system) table', () => {
    render(
      <TableSettingsModal
        table="_salve_relations"
        isSystem
        onTruncate={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText('Truncate table')).toBeInTheDocument();
    expect(screen.queryByText('Delete table')).not.toBeInTheDocument();
    expect(screen.getByText(/can only be truncated/)).toBeInTheDocument();
  });

  it('asks for confirmation before truncating, then calls onTruncate and closes', async () => {
    const onTruncate = vi.fn();
    const onClose = vi.fn();
    render(
      <TableSettingsModal table="users" isSystem={false} onTruncate={onTruncate} onDelete={vi.fn()} onClose={onClose} />
    );

    fireEvent.click(screen.getByText('Truncate table'));
    expect(onTruncate).not.toHaveBeenCalled();
    expect(screen.getByText(/Delete every row in "users"/)).toBeInTheDocument();

    fireEvent.click(screen.getByText('Confirm'));

    expect(onTruncate).toHaveBeenCalledWith('users');
    expect(onClose).toHaveBeenCalled();
  });

  it('asks for confirmation before deleting, then calls onDelete and closes', () => {
    const onDelete = vi.fn();
    const onClose = vi.fn();
    render(
      <TableSettingsModal table="users" isSystem={false} onTruncate={vi.fn()} onDelete={onDelete} onClose={onClose} />
    );

    fireEvent.click(screen.getByText('Delete table'));
    expect(screen.getByText(/Permanently delete the "users" table/)).toBeInTheDocument();

    fireEvent.click(screen.getByText('Confirm'));

    expect(onDelete).toHaveBeenCalledWith('users');
    expect(onClose).toHaveBeenCalled();
  });

  it('cancel returns to the action list without calling onTruncate/onDelete', () => {
    const onTruncate = vi.fn();
    const onDelete = vi.fn();
    render(
      <TableSettingsModal
        table="users"
        isSystem={false}
        onTruncate={onTruncate}
        onDelete={onDelete}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText('Delete table'));
    fireEvent.click(screen.getByText('Cancel'));

    expect(screen.getByText('Truncate table')).toBeInTheDocument();
    expect(onTruncate).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('closes when clicking the backdrop or the close button', async () => {
    const onClose = vi.fn();
    render(
      <TableSettingsModal table="users" isSystem={false} onTruncate={vi.fn()} onDelete={vi.fn()} onClose={onClose} />
    );

    fireEvent.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not close when clicking inside the dialog', () => {
    const onClose = vi.fn();
    render(
      <TableSettingsModal table="users" isSystem={false} onTruncate={vi.fn()} onDelete={vi.fn()} onClose={onClose} />
    );

    fireEvent.click(screen.getByText('users'));

    expect(onClose).not.toHaveBeenCalled();
  });
});
