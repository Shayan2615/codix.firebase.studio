// Import necessary Firebase modules
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

// Initialize Firebase Admin SDK
admin.initializeApp();
const db = admin.firestore();

// --- Helper Functions ---

/**
 * Generates a 7-digit secret code adhering to the game rules.
 * Rules:
 * 1) All digits must not be the same.
 * 2) No more than 3 consecutive repeated digits.
 */
function generateSecretCode(): number[] {
    let code: number[];
    let isValid: boolean;

    do {
        code = Array.from({ length: 7 }, () => Math.floor(Math.random() * 10)); // Generate 7 random digits
        isValid = true;

        // Rule 1: All digits must not be the same
        if (new Set(code).size === 1) {
            isValid = false;
            continue;
        }

        // Rule 2: No more than 3 consecutive repeated digits
        let consecutiveCount = 0;
        for (let i = 0; i < code.length; i++) {
            if (i > 0 && code[i] === code[i - 1]) {
                consecutiveCount++;
            } else {
                consecutiveCount = 1;
            }
            if (consecutiveCount > 3) {
                isValid = false;
                break;
            }
        }
    } while (!isValid);

    return code;
}

/**
 * Checks if two 7-digit codes are identical.
 * @param code1 First code (array of numbers).
 * @param code2 Second code (array of numbers).
 * @returns true if codes are identical, false otherwise.
 */
function areCodesEqual(code1: number[], code2: number[]): boolean {
    if (code1.length !== 7 || code2.length !== 7) {
        return false;
    }
    for (let i = 0; i < 7; i++) {
        if (code1[i] !== code2[i]) {
            return false;
        }
    }
    return true;
}

/**
 * Utility function to end a round, setting its status to inactive and recording the end time.
 * Can be called internally by other functions (e.g., submitGuess when max winners are reached)
 * or by an admin function.
 */
async function endRound(roundId: string, transaction: admin.firestore.Transaction) {
    const roundRef = db.collection('rounds').doc(roundId);
    transaction.update(roundRef, {
        isActive: false,
        endTime: admin.firestore.FieldValue.serverTimestamp(),
    });
    functions.logger.info(`Round ${roundId} ended.`);
}


// --- Cloud Functions ---

/**
 * Callable Cloud Function to start a new round.
 * This should only be called by an authenticated administrator or via a scheduled job.
 */
export const startRound = functions.https.onCall(async (data, context) => {
    // Optional: Implement admin check here if only admins can start a round
    // if (!context.auth || !context.auth.token.admin) {
    //     throw new functions.https.HttpsError('permission-denied', 'Only admins can start a round.');
    // }

    try {
        let newRoundId: string = ''; // Initialize here

        await db.runTransaction(async (transaction) => {
            // Get the current highest round number to determine the new one
            const roundsSnapshot = await transaction.get(
                db.collection('rounds').orderBy('roundNumber', 'desc').limit(1)
            );

            let newRoundNumber = 1;
            if (!roundsSnapshot.empty) {
                const lastRound = roundsSnapshot.docs[0].data();
                newRoundNumber = lastRound.roundNumber + 1;

                // Mark the previous round as inactive
                const lastRoundRef = db.collection('rounds').doc(roundsSnapshot.docs[0].id); // Use docs[0].id for the reference
                transaction.update(lastRoundRef, { isActive: false, endTime: admin.firestore.FieldValue.serverTimestamp() });
            }

            // Create the new round document
            const newRoundRef = db.collection('rounds').doc(); // Auto-generate ID for the new round
            newRoundId = newRoundRef.id; // Assign to the outer scope variable

            transaction.set(newRoundRef, {
                id: newRoundId, // Use the assigned ID
                roundNumber: newRoundNumber,
                isActive: true,
                winnerCount: 0,
                maxWinners: 10, // As per requirements
                startTime: admin.firestore.FieldValue.serverTimestamp(),
                endTime: null, // Will be set when the round ends
                secretCodesGenerated: false, // Will be set to true after all user codes are assigned (though we assign on demand)
            });
        });

        // Ensure newRoundId is assigned before logging/returning
        if (!newRoundId) {
            throw new functions.https.HttpsError('internal', 'Failed to generate new round ID during transaction.');
        }

        functions.logger.info(`New round started: ${newRoundId}`);
        return { success: true, roundId: newRoundId, message: `Round ${newRoundId} started successfully.` };

    } catch (error: any) {
        functions.logger.error("Error starting new round:", error);
        throw new functions.https.HttpsError('internal', 'Failed to start new round', error.message);
    }
});

/**
 * Assigns a unique secret code to a user for the current active round.
 * This function should be called by the client when a user enters a new round
 * and doesn't have a code yet.
 */
export const assignSecretCode = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
    }
    const userId = context.auth!.uid; // Assert userId as string

    try {
        let assignedCode: number[] | null = null;
        let activeRoundId: string | null = null;
        let userHasExistingCode = false;

        await db.runTransaction(async (transaction) => {
            // 1. Get the active round
            const activeRoundSnapshot = await transaction.get(
                db.collection('rounds').where('isActive', '==', true).limit(1)
            );

            if (activeRoundSnapshot.empty) {
                throw new functions.https.HttpsError('failed-precondition', 'No active round found.');
            }

            const activeRoundDoc = activeRoundSnapshot.docs[0];
            activeRoundId = activeRoundDoc.id;

            // 2. Check if the user already has a code for this round
            const userCodeSnapshot = await transaction.get(
                db.collection('userCodes')
                    .where('userId', '==', userId)
                    .where('roundId', '==', activeRoundId)
                    .limit(1)
            );

            if (!userCodeSnapshot.empty) {
                // User already has a code for this round, return it (but not to client directly)
                assignedCode = userCodeSnapshot.docs[0].data().secretCode;
                userHasExistingCode = true;
                functions.logger.info(`User ${userId} already has a code for round ${activeRoundId}.`);
            } else {
                // 3. Generate and assign a new unique code
                let isUnique = false;
                let generatedCode: number[] = [];

                // Keep generating until a unique code is found for this round
                while (!isUnique) {
                    generatedCode = generateSecretCode();
                    const existingCodeQuery = db.collection('userCodes')
                        .where('roundId', '==', activeRoundId)
                        .where('secretCode', '==', generatedCode); // Firestore queries by array equality

                    const existingCodeSnapshot = await transaction.get(existingCodeQuery);
                    if (existingCodeSnapshot.empty) {
                        isUnique = true;
                    }
                }
                assignedCode = generatedCode;

                // Store the new code for the user
                const userCodeRef = db.collection('userCodes').doc();
                transaction.set(userCodeRef, {
                    userId: userId,
                    roundId: activeRoundId,
                    secretCode: assignedCode, // This is the secret, never send to client
                    isWinner: false,
                    attempts: 0,
                    hintPurchases: 0,
                    revealedDigits: [], // No digits revealed initially
                });

                // Update user's current round and reset client-side state for the new round
                const userRef = db.collection('users').doc(userId);
                // We use .get() to ensure the user document exists or create it
                const userDoc = await transaction.get(userRef);
                if (!userDoc.exists) {
                    transaction.set(userRef, {
                        email: context.auth?.token?.email || null, // Access token.email safely
                        createdAt: admin.firestore.FieldValue.serverTimestamp(),
                        lastLogin: admin.firestore.FieldValue.serverTimestamp(),
                        currentRoundId: activeRoundId,
                        isWinnerInCurrentRound: false,
                        hintCount: 0,
                        attemptsInCurrentRound: 0,
                        selectedCode: Array(7).fill(-1), // Reset selected code, -1 for unselected
                        revealedHintDigits: [], // Reset revealed digits
                        walletBalanceUsdt: 0, // Initialize or fetch from external payment system
                    });
                } else {
                    transaction.update(userRef, {
                        currentRoundId: activeRoundId,
                        isWinnerInCurrentRound: false,
                        hintCount: 0,
                        attemptsInCurrentRound: 0,
                        selectedCode: Array(7).fill(-1), // Reset selected code
                        revealedHintDigits: [], // Reset revealed digits
                    });
                }

                functions.logger.info(`User ${userId} assigned new code for round ${activeRoundId}.`);
            }
        });

        // IMPORTANT: Never return the actual secret code to the client!
        // This function just confirms that a code has been assigned.
        // The client will query its 'users' document for state (e.g., currentRoundId, hintCount).
        return { success: true, roundId: activeRoundId, message: userHasExistingCode ? "Secret code already exists for the active round." : "Secret code assigned for the active round." };

    } catch (error: any) {
        functions.logger.error("Error assigning secret code:", error);
        throw new functions.https.HttpsError('internal', 'Failed to assign secret code.', error.message);
    }
});

/**
 * Callable Cloud Function to submit a user's guess for the secret code.
 * This function handles all game logic for checking the guess, determining winners,
 * and applying anti-cheat measures.
 */
export const submitGuess = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
    }
    const userId: string = context.auth.uid; // Assert userId as string
    const guessedCode: number[] = data.code; // Expecting an array of 7 numbers

    // Basic input validation
    if (!Array.isArray(guessedCode) || guessedCode.length !== 7 || !guessedCode.every(num => typeof num === 'number' && num >= 0 && num <= 9)) {
        throw new functions.https.HttpsError('invalid-argument', 'Invalid guessed code format. Must be an array of 7 digits.');
    }

    try {
        let isCorrectGuess = false;
        let roundEnded = false;
        let winnerNumber: number | null = null;

        await db.runTransaction(async (transaction) => {
            // 1. Get current active round
            const activeRoundSnapshot = await transaction.get(
                db.collection('rounds').where('isActive', '==', true).limit(1)
            );
            if (activeRoundSnapshot.empty) {
                throw new functions.https.HttpsError('failed-precondition', 'No active round found.');
            }
            const activeRoundDoc = activeRoundSnapshot.docs[0];
            const activeRoundData = activeRoundDoc.data()!; // Non-null assertion after check
            const activeRoundId = activeRoundDoc.id;

            // 2. Get user's current state and code for this round
            const userRef = db.collection('users').doc(userId);
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists) {
                throw new functions.https.HttpsError('not-found', 'User data not found.');
            }
            const userData = userDoc.data()!; // Non-null assertion after check

            const userCodeSnapshot = await transaction.get(
                db.collection('userCodes')
                    .where('userId', '==', userId)
                    .where('roundId', '==', activeRoundId)
                    .limit(1)
            );
            if (userCodeSnapshot.empty) {
                throw new functions.https.HttpsError('failed-precondition', 'User has no code assigned for the current round.');
            }
            const userCodeDoc = userCodeSnapshot.docs[0];
            const userCodeData = userCodeDoc.data()!; // Non-null assertion after check

            // Anti-cheat: Check if user is already a winner in this round
            if (userData.isWinnerInCurrentRound === true) {
                throw new functions.https.HttpsError('failed-precondition', 'You have already won in this round.');
            }
            if (userCodeData.isWinner === true) {
                throw new functions.https.HttpsError('failed-precondition', 'You have already won in this round.');
            }

            // Anti-cheat: Rate limiting for guess attempts (simple in-function check)
            // For production, consider dedicated rate-limiting services or more robust Firestore-based tracking
            const lastAttemptTime = userData.lastGuessAttempt?.toDate();
            const attemptsCount = userData.attemptsInCurrentRound || 0;
            const now = new Date();

            const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
            const MAX_ATTEMPTS_PER_WINDOW = 10; // Max 10 attempts per minute

            if (lastAttemptTime && (now.getTime() - lastAttemptTime.getTime() < RATE_LIMIT_WINDOW_MS)) {
                if (attemptsCount >= MAX_ATTEMPTS_PER_WINDOW) {
                    throw new functions.https.HttpsError('resource-exhausted', 'Too many guess attempts. Please wait a moment before trying again.');
                }
            } else {
                // Reset attempts count if window has passed
                transaction.update(userRef, { attemptsInCurrentRound: 0 });
            }

            // Increment attempt count for the current request
            transaction.update(userRef, {
                attemptsInCurrentRound: admin.firestore.FieldValue.increment(1),
                lastGuessAttempt: admin.firestore.FieldValue.serverTimestamp(),
            });
            transaction.update(userCodeDoc.ref, {
                attempts: admin.firestore.FieldValue.increment(1),
            });


            // 3. Compare guessed code with the actual secret code
            const secretCode = userCodeData.secretCode;
            isCorrectGuess = areCodesEqual(guessedCode, secretCode); // Use the helper function here

            if (isCorrectGuess) {
                // User guessed correctly!
                if (activeRoundData.winnerCount >= activeRoundData.maxWinners) {
                    throw new functions.https.HttpsError('failed-precondition', 'Round has already reached maximum winners.');
                }

                // Increment winner count for the round
                transaction.update(activeRoundDoc.ref, {
                    winnerCount: admin.firestore.FieldValue.increment(1),
                });

                // Mark user as winner in both user and userCode documents
                transaction.update(userRef, {
                    isWinnerInCurrentRound: true,
                });
                transaction.update(userCodeDoc.ref, {
                    isWinner: true,
                });

                // Add to winners collection
                winnerNumber = activeRoundData.winnerCount + 1; // This is the winner's rank
                const winnerRef = db.collection('winners').doc();
                transaction.set(winnerRef, {
                    roundId: activeRoundId,
                    userId: userId,
                    winnerNumber: winnerNumber,
                    winningTime: admin.firestore.FieldValue.serverTimestamp(),
                    secretCodeAtWin: secretCode,
                });

                // If this is the 10th winner, end the round
                if (winnerNumber === activeRoundData.maxWinners) {
                    await endRound(activeRoundId, transaction); // Call the utility function
                    roundEnded = true;

                    // Reset the 10th winner's state for the new round immediately, as per requirements
                    transaction.update(userRef, {
                        currentRoundId: null, // Indicates they need a new round assignment
                        isWinnerInCurrentRound: false,
                        hintCount: 0,
                        attemptsInCurrentRound: 0,
                        selectedCode: Array(7).fill(-1),
                        revealedHintDigits: [],
                    });
                    functions.logger.info(`10th winner ${userId} state reset for new round.`);
                }
            }
        }); // End of transaction

        return {
            success: true,
            isCorrect: isCorrectGuess,
            isWinner: isCorrectGuess, // If correct, they are a winner
            roundEnded: roundEnded,
            winnerNumber: winnerNumber,
            message: isCorrectGuess ? 'Congratulations! You guessed the code correctly!' : 'Incorrect code. Try again!',
        };

    } catch (error: any) {
        functions.logger.error("Error submitting guess:", error);
        if (error.code) {
            throw error; // Re-throw HttpsError
        }
        throw new functions.https.HttpsError('internal', 'Failed to submit guess.', error.message);
    }
});

/**
 * Callable Cloud Function to request a hint.
 * This function initiates a payment request and, upon confirmation, reveals a digit.
 */
export const requestHint = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
    }
    const userId: string = context.auth.uid; // Assert userId as string
    const HINT_PRICE_USDT = 0.5;
    const MAX_HINTS_PER_ROUND = 3;

    try {
        let paymentInitiated = false;

        await db.runTransaction(async (transaction) => {
            // 1. Get user's current state
            const userRef = db.collection('users').doc(userId);
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists) {
                throw new functions.https.HttpsError('not-found', 'User data not found.');
            }
            const userData = userDoc.data()!; // Non-null assertion after check

            // 2. Get active round
            const activeRoundSnapshot = await transaction.get(
                db.collection('rounds').where('isActive', '==', true).limit(1)
            );
            if (activeRoundSnapshot.empty) {
                throw new functions.https.HttpsError('failed-precondition', 'No active round found.');
            }
            const activeRoundDoc = activeRoundSnapshot.docs[0];
            const activeRoundId = activeRoundDoc.id;

            // 3. Get user's specific code data for the current round
            const userCodeSnapshot = await transaction.get(
                db.collection('userCodes')
                    .where('userId', '==', userId)
                    .where('roundId', '==', activeRoundId)
                    .limit(1)
            );
            if (userCodeSnapshot.empty) {
                throw new functions.https.HttpsError('failed-precondition', 'User has no code assigned for the current round.');
            }
            const userCodeDoc = userCodeSnapshot.docs[0];
            const userCodeData = userCodeDoc.data()!; // Non-null assertion after check

            // Anti-cheat: Check if user already won
            if (userData.isWinnerInCurrentRound === true || userCodeData.isWinner === true) {
                throw new functions.https.HttpsError('failed-precondition', 'You cannot request a hint after winning.');
            }

            // Anti-cheat: Check hint limit
            const hintsUsed = userCodeData.hintPurchases || 0;
            if (hintsUsed >= MAX_HINTS_PER_ROUND) {
                throw new functions.https.HttpsError('resource-exhausted', 'You have reached the maximum number of hints for this round.');
            }

            // Anti-cheat: Rate limiting for hint requests (similar to submitGuess)
            const lastHintRequestTime = userData.lastHintRequest?.toDate();
            const now = new Date();
            const HINT_RATE_LIMIT_WINDOW_MS = 10 * 1000; // 10 seconds between hint requests

            if (lastHintRequestTime && (now.getTime() - lastHintRequestTime.getTime() < HINT_RATE_LIMIT_WINDOW_MS)) {
                throw new functions.https.HttpsError('resource-exhausted', 'Please wait a moment before requesting another hint.');
            }

            // Find an unrevealed digit to target for the hint
            const secretCode = userCodeData.secretCode;
            const revealedHintDigitsSet = new Set(userCodeData.revealedDigits || []);
            const availableIndices = Array.from({ length: 7 }, (_, i) => i)
                .filter(index => !revealedHintDigitsSet.has(index));

            if (availableIndices.length === 0) {
                throw new functions.https.HttpsError('failed-precondition', 'All digits have already been revealed for your code.');
            }

            // Pick a random unrevealed digit index
            const randomIndex = Math.floor(Math.random() * availableIndices.length);
            const digitIndexToReveal = availableIndices[randomIndex];

            // Update user's last hint request time
            transaction.update(userRef, {
                lastHintRequest: admin.firestore.FieldValue.serverTimestamp(),
            });

            // 4. Create a payment record (status: pending)
            const paymentRef = db.collection('payments').doc();
            transaction.set(paymentRef, {
                userId: userId,
                roundId: activeRoundId,
                amountUsdt: HINT_PRICE_USDT,
                status: 'pending',
                paymentInitiatedAt: admin.firestore.FieldValue.serverTimestamp(),
                hintProvided: false,
                requestedDigitIndex: digitIndexToReveal, // Store which digit to reveal upon payment
            });
            paymentInitiated = true;

            functions.logger.info(`Hint payment initiated for user ${userId} in round ${activeRoundId}. Payment ID: ${paymentRef.id}`);
            // No return from inside transaction as it will be handled by the outer return
        });

        // The return structure for a callable function should be consistent.
        // This outer return will be reached if the transaction commits successfully.
        return { success: true, paymentInitiated: paymentInitiated, message: 'Hint request processed. Awaiting payment confirmation.', amount: HINT_PRICE_USDT };

    } catch (error: any) {
        functions.logger.error("Error requesting hint:", error);
        if (error.code) {
            throw error; // Re-throw HttpsError
        }
        throw new functions.https.HttpsError('internal', 'Failed to request hint.', error.message);
    }
});

/**
 * HTTP Cloud Function to confirm a payment for a hint.
 * This function should be called by your payment gateway's webhook
 * after a successful payment for a hint. NEVER expose this endpoint directly to the client.
 */
export const confirmPayment = functions.https.onRequest(async (req, res) => {
    // Implement security checks: Verify webhook signature, source IP, etc.
    // For production, you MUST validate the origin and authenticity of the webhook.
    // Example: const secret = functions.config().stripe.webhook_secret;
    // try {
    //     event = stripe.webhooks.constructEvent(req.rawBody, req.headers['stripe-signature'], secret);
    // } catch (err) {
    //     functions.logger.error('Webhook signature verification failed.', err);
    //     res.status(400).send('Webhook Error: Invalid Signature');
    //     return;
    // }

    // Assume `req.body` contains `paymentId` (our internal record ID) and `transactionId` (from payment gateway)
    // In a real webhook, you might receive a different payload format and need to parse it.
    const { paymentId, transactionId } = req.body;

    if (!paymentId || !transactionId) {
        functions.logger.warn("Missing paymentId or transactionId in confirmPayment request body.");
        res.status(400).send('Bad Request: Missing paymentId or transactionId.');
        return;
    }

    try {
        let hintDigitIndex: number | null = null;
        let hintDigitValue: number | null = null;
        let userIdForLog: string = "unknown";
        let roundIdForLog: string = "unknown";

        await db.runTransaction(async (transaction) => {
            const paymentRef = db.collection('payments').doc(paymentId);
            const paymentDoc = await transaction.get(paymentRef);

            if (!paymentDoc.exists) {
                functions.logger.warn(`Payment record not found for ID: ${paymentId}`);
                // Respond 200 to webhook but effectively abort internal processing for non-existent ID
                res.status(200).send('Payment record not found internally.');
                // By throwing, we ensure the transaction is aborted without committing partial changes.
                // The outer catch block will then prevent sending a second response.
                throw new Error('Payment record not found.');
            }

            const paymentData = paymentDoc.data()!; // Non-null assertion after check
            userIdForLog = paymentData.userId || "unknown";
            roundIdForLog = paymentData.roundId || "unknown";

            if (paymentData.status === 'completed' && paymentData.hintProvided === true) {
                // Payment already processed and hint given
                functions.logger.info(`Payment ${paymentId} for user ${userIdForLog} already confirmed and hint provided.`);
                res.status(200).send('Payment already processed.');
                throw new Error('Payment already processed and hint provided.');
            }
            if (paymentData.status !== 'pending') {
                functions.logger.warn(`Payment ${paymentId} for user ${userIdForLog} is not in pending state. Current status: ${paymentData.status}`);
                res.status(200).send('Payment is not in pending state.');
                throw new Error('Payment not in pending state.');
            }

            // In a real system, here you would:
            // 1. Call your payment gateway's API to verify `transactionId` against their records.
            // 2. Check if the amount matches `paymentData.amountUsdt`.
            // 3. Ensure the payment is for the correct `userId`.
            // If verification fails, update payment status to 'failed' and respond accordingly.

            // For this example, we proceed as if external verification succeeded.
            const paymentVerifiedExternally = true; // Replace with actual external verification logic

            if (!paymentVerifiedExternally) {
                transaction.update(paymentRef, { status: 'failed', paymentConfirmedAt: admin.firestore.FieldValue.serverTimestamp() });
                functions.logger.error(`External payment verification failed for payment ${paymentId} (transaction: ${transactionId}).`);
                res.status(400).send('External payment verification failed.');
                throw new Error('External payment verification failed.');
            }

            // Payment confirmed. Update payment record.
            transaction.update(paymentRef, {
                status: 'completed',
                transactionId: transactionId,
                paymentConfirmedAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            // Now, provide the hint
            const userId = paymentData.userId;
            const roundId = paymentData.roundId;

            const userCodeSnapshot = await transaction.get(
                db.collection('userCodes')
                    .where('userId', '==', userId)
                    .where('roundId', '==', roundId)
                    .limit(1)
            );
            if (userCodeSnapshot.empty) {
                functions.logger.error(`User ${userId} has no code assigned for round ${roundId} during hint confirmation.`);
                res.status(500).send('Internal Error: User code not found.');
                throw new Error('User has no code assigned for this round.');
            }
            const userCodeDoc = userCodeSnapshot.docs[0];
            const userCodeData = userCodeDoc.data()!; // Non-null assertion after check
            const secretCode = userCodeData.secretCode;

            const currentRevealedDigits: number[] = userCodeData.revealedDigits || [];
            const requestedDigitIndex = paymentData.requestedDigitIndex;

            if (typeof requestedDigitIndex !== 'number' || requestedDigitIndex < 0 || requestedDigitIndex >= 7) {
                 functions.logger.error(`Invalid requestedDigitIndex ${requestedDigitIndex} in payment record ${paymentId}.`);
                 res.status(500).send('Internal Error: Invalid requested digit index.');
                 throw new Error('Invalid requested digit index in payment record.');
            }


            let newRevealedDigits = [...currentRevealedDigits];
            if (!currentRevealedDigits.includes(requestedDigitIndex)) {
                newRevealedDigits.push(requestedDigitIndex);
                newRevealedDigits.sort((a, b) => a - b); // Keep sorted for consistency
            } else {
                functions.logger.warn(`Digit at index ${requestedDigitIndex} was already revealed for user ${userId} in round ${roundId}.`);
            }

            // Update userCode document with the revealed digit
            transaction.update(userCodeDoc.ref, {
                hintPurchases: admin.firestore.FieldValue.increment(1),
                revealedDigits: newRevealedDigits,
            });

            // Update user document for client-side state persistence
            const userRef = db.collection('users').doc(userId);
            transaction.update(userRef, {
                hintCount: admin.firestore.FieldValue.increment(1),
                revealedHintDigits: newRevealedDigits,
                // Also update selectedCode for immediate client update (if client is listening)
                // Need to fetch current selectedCode first to merge
                // const currentUserData = (await transaction.get(userRef)).data();
                // let clientSelectedCode = currentUserData?.selectedCode || Array(7).fill(-1);
                // clientSelectedCode[requestedDigitIndex] = secretCode[requestedDigitIndex];
                // transaction.update(userRef, { selectedCode: clientSelectedCode });
                // ^ This part would require careful client-side merge logic or a separate `updateClientSelectedCode` function
            });

            // Mark hint as provided in payment record
            transaction.update(paymentRef, { hintProvided: true });

            hintDigitIndex = requestedDigitIndex;
            hintDigitValue = secretCode[requestedDigitIndex];
        });

        // This ensures the response is only sent once if the transaction succeeds completely.
        if (!res.headersSent) {
            functions.logger.info(`Payment ${paymentId} for user ${userIdForLog} in round ${roundIdForLog} confirmed. Hint provided: index ${hintDigitIndex}, value ${hintDigitValue}`);
            res.status(200).send('Payment confirmed and hint provided.');
        }

    } catch (error: any) {
        functions.logger.error("Error confirming payment or providing hint:", error);
        // Ensure a response is sent if one hasn't been already by an earlier throw within the transaction.
        if (!res.headersSent) {
            res.status(500).send('Internal Server Error processing payment confirmation.');
        }
    }
});


// We will export a `finishRound` callable function for admin use, if a round needs to be manually ended.
export const finishRound = functions.https.onCall(async (data, context) => {
    const roundId = data.roundId;
    if (!roundId) {
        throw new functions.https.HttpsError('invalid-argument', 'Round ID is required.');
    }

    try {
        await db.runTransaction(async (transaction) => {
            const roundRef = db.collection('rounds').doc(roundId);
            const roundDoc = await transaction.get(roundRef);

            if (!roundDoc.exists) {
                throw new functions.https.HttpsError('not-found', 'Round not found.');
            }

            const roundData = roundDoc.data();
            if (!roundData?.isActive) {
                throw new functions.https.HttpsError('failed-precondition', 'Round is not active.');
            }

            await endRound(roundId, transaction);
        });

        return { success: true, message: `Round ${roundId} manually ended.` };

    } catch (error: any) {
        functions.logger.error("Error finishing round manually:", error);
        if (error.code) {
            throw error;
        }
        throw new functions.https.HttpsError('internal', 'Failed to manually finish round.', error.message);
    }
});