import { BoardPage } from './pages/BoardPage';
import { WelcomePage } from './pages/WelcomePage';
import { useLocation } from './router';

export default function App() {
  const path = useLocation().split('#')[0];
  const board = path.match(/^\/b\/([A-Za-z0-9]+)\/?$/);
  if (board) return <BoardPage key={board[1]} id={board[1]} />;
  return <WelcomePage />;
}
