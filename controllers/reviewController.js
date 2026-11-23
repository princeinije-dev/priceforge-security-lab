import {
  createReview,
  updateReview,
  deleteReview
} from "../models/reviewModel.js";

export async function submitReview(req, res) {
  try {
    const productId = req.params.id;
    const { rating, title, comment } = req.body;

    if (!rating || !comment) {
      return res.redirect(`/products/${productId}?error=` + encodeURIComponent("Rating and review text are required."));
    }

    await createReview(req.user.id, productId, rating, title || "", comment);
    res.redirect(`/products/${productId}?msg=` + encodeURIComponent("Thank you! Your review has been published."));
  } catch (err) {
    console.error("Review submission error:", err);
    res.redirect(`/products/${req.params.id}?error=` + encodeURIComponent("Failed to submit review."));
  }
}

export async function editReview(req, res) {
  try {
    const { reviewId, productId } = req.params;
    const { rating, title, comment } = req.body;

    await updateReview(reviewId, req.user.id, rating, title, comment);
    res.redirect(`/products/${productId}?msg=` + encodeURIComponent("Review updated."));
  } catch (err) {
    console.error("Review edit error:", err);
    res.redirect(`/products/${req.params.productId}?error=` + encodeURIComponent("Failed to update review."));
  }
}

export async function deleteReviewAction(req, res) {
  try {
    const { reviewId, productId } = req.params;
    await deleteReview(reviewId, req.user.id);
    res.redirect(`/products/${productId}?msg=` + encodeURIComponent("Review deleted."));
  } catch (err) {
    console.error("Review delete error:", err);
    res.redirect(`/products/${req.params.productId}?error=` + encodeURIComponent("Failed to delete review."));
  }
}
