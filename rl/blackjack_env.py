"""
rl/blackjack_env.py
===================
Blackjack Markov Decision Process (MDP) Environment and Optimal Basic Strategy Benchmark.
"""

import random
from typing import NamedTuple, Tuple


class BlackjackState(NamedTuple):
    player_sum: int      # 4 to 21
    dealer_card: int     # 1 (Ace) to 10
    usable_ace: bool     # True if player holds an Ace counted as 11 without busting


class BlackjackEnv:
    """
    Standard Casino Blackjack Environment conforming to standard MDP formulation.
    Actions:
        0: STAND
        1: HIT
    """
    STAND = 0
    HIT = 1

    def __init__(self, natural_payout: float = 1.5):
        self.natural_payout = natural_payout
        self.player_cards = []
        self.dealer_cards = []

    def _draw_card(self) -> int:
        """Draw a card from an infinite deck (1=Ace, 2-10=face value, 10=J/Q/K)."""
        card = random.randint(1, 13)
        return min(card, 10)

    def _calculate_hand(self, cards) -> Tuple[int, bool]:
        """Calculates hand total and whether an ace is usable (counted as 11)."""
        total = sum(cards)
        usable_ace = False
        if 1 in cards and total + 10 <= 21:
            total += 10
            usable_ace = True
        return total, usable_ace

    def reset(self) -> BlackjackState:
        """Starts a new hand, dealing 2 cards to player and 2 to dealer (one visible)."""
        self.player_cards = [self._draw_card(), self._draw_card()]
        self.dealer_cards = [self._draw_card(), self._draw_card()]
        
        # Ensure player starts with valid hand
        player_sum, usable_ace = self._calculate_hand(self.player_cards)
        return BlackjackState(
            player_sum=player_sum,
            dealer_card=self.dealer_cards[0],
            usable_ace=usable_ace
        )

    def step(self, action: int) -> Tuple[BlackjackState, float, bool, dict]:
        """
        Executes one action (HIT or STAND).
        Returns:
            next_state, reward, done, info
        """
        if action == self.HIT:
            self.player_cards.append(self._draw_card())
            player_sum, usable_ace = self._calculate_hand(self.player_cards)
            
            if player_sum > 21:
                # Player busts
                return (
                    BlackjackState(player_sum, self.dealer_cards[0], usable_ace),
                    -1.0,
                    True,
                    {"result": "Player Busts", "player_total": player_sum, "dealer_total": sum(self.dealer_cards)}
                )
            else:
                # Continue hand
                return (
                    BlackjackState(player_sum, self.dealer_cards[0], usable_ace),
                    0.0,
                    False,
                    {"result": "Player Hits", "player_total": player_sum}
                )

        else:  # STAND
            player_sum, usable_ace = self._calculate_hand(self.player_cards)
            
            # Dealer plays: hits until 17 or higher
            dealer_sum, dealer_usable = self._calculate_hand(self.dealer_cards)
            while dealer_sum < 17:
                self.dealer_cards.append(self._draw_card())
                dealer_sum, dealer_usable = self._calculate_hand(self.dealer_cards)

            # Determine winner
            if dealer_sum > 21:
                reward = 1.0
                result = "Dealer Busts - Player Wins"
            elif dealer_sum > player_sum:
                reward = -1.0
                result = "Dealer Wins"
            elif dealer_sum < player_sum:
                reward = 1.0
                result = "Player Wins"
            else:
                reward = 0.0
                result = "Push (Tie)"

            # Check for natural blackjack
            if len(self.player_cards) == 2 and player_sum == 21:
                if len(self.dealer_cards) == 2 and dealer_sum == 21:
                    reward = 0.0
                    result = "Push (Double Blackjack)"
                else:
                    reward = self.natural_payout
                    result = "Player Natural Blackjack!"

            return (
                BlackjackState(player_sum, self.dealer_cards[0], usable_ace),
                reward,
                True,
                {
                    "result": result,
                    "player_total": player_sum,
                    "dealer_total": dealer_sum,
                    "dealer_cards": self.dealer_cards
                }
            )


def optimal_basic_strategy(state: BlackjackState) -> int:
    """
    Standard textbook Basic Strategy for single/multi-deck blackjack without surrender/split.
    Returns: 0 (STAND) or 1 (HIT).
    """
    player = state.player_sum
    dealer = state.dealer_card  # 1 is Ace

    if state.usable_ace:
        # Soft hands (A,2 through A,9)
        if player >= 19:
            return BlackjackEnv.STAND
        elif player == 18:
            return BlackjackEnv.STAND if dealer in [2, 7, 8] else BlackjackEnv.HIT
        else:
            return BlackjackEnv.HIT
    else:
        # Hard hands
        if player >= 17:
            return BlackjackEnv.STAND
        elif 13 <= player <= 16:
            # Stand if dealer has 2-6, hit on 7-Ace
            return BlackjackEnv.STAND if 2 <= dealer <= 6 else BlackjackEnv.HIT
        elif player == 12:
            # Stand if dealer has 4-6, else hit
            return BlackjackEnv.STAND if 4 <= dealer <= 6 else BlackjackEnv.HIT
        else:
            # 11 or lower: always hit
            return BlackjackEnv.HIT
