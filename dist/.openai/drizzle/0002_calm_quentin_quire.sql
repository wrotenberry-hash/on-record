CREATE TABLE `scoring_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`representation_id` text NOT NULL,
	`proposition_id` text NOT NULL,
	`methodology_version_id` text NOT NULL,
	`revision` integer NOT NULL,
	`accuracy_anchor` text NOT NULL,
	`context_integrity` text NOT NULL,
	`authority` integer NOT NULL,
	`sufficiency` integer NOT NULL,
	`directness` integer NOT NULL,
	`temporal_fit` integer NOT NULL,
	`explanation` text NOT NULL,
	`created_at` integer NOT NULL,
	`authored_by` text NOT NULL,
	FOREIGN KEY (`representation_id`) REFERENCES `representations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`proposition_id`) REFERENCES `propositions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`methodology_version_id`) REFERENCES `methodology_versions`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "scoring_proposals_revision_positive" CHECK("scoring_proposals"."revision" > 0),
	CONSTRAINT "scoring_proposals_accuracy_anchor_allowed" CHECK("scoring_proposals"."accuracy_anchor" IN ('100','95','85','65','35','15','0','U')),
	CONSTRAINT "scoring_proposals_context_integrity_allowed" CHECK("scoring_proposals"."context_integrity" IN ('100','85','60','30','0','N/A')),
	CONSTRAINT "scoring_proposals_confidence_range" CHECK("scoring_proposals"."authority" BETWEEN 0 AND 25 AND "scoring_proposals"."sufficiency" BETWEEN 0 AND 25 AND "scoring_proposals"."directness" BETWEEN 0 AND 25 AND "scoring_proposals"."temporal_fit" BETWEEN 0 AND 25),
	CONSTRAINT "scoring_proposals_explanation_nonempty" CHECK(trim("scoring_proposals"."explanation") <> '' AND trim("scoring_proposals"."authored_by") <> '')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `scoring_proposals_representation_revision_uq` ON `scoring_proposals` (`representation_id`,`revision`);--> statement-breakpoint
CREATE TRIGGER `scoring_proposals_integrity` BEFORE INSERT ON `scoring_proposals` BEGIN
  SELECT RAISE(ABORT, 'score proposal requires authenticated source, approved representation and locked materiality') WHERE NOT EXISTS (
    SELECT 1 FROM representations r
    JOIN materiality_decisions m ON m.representation_id = r.id AND m.tier <> 'NOT_MATERIAL'
    JOIN source_captures c ON c.id = r.capture_id
    JOIN source_authentications sa ON sa.capture_id = c.id AND sa.reviewed_content_hash = c.content_hash
    WHERE r.id = NEW.representation_id AND r.status = 'APPROVED'
      AND r.proposition_id = NEW.proposition_id AND m.methodology_version_id = NEW.methodology_version_id
      AND sa.verified_at <= m.locked_at AND m.locked_at < NEW.created_at
  );
END;
--> statement-breakpoint
CREATE TRIGGER `scoring_proposals_immutable_update` BEFORE UPDATE ON `scoring_proposals` BEGIN SELECT RAISE(ABORT, 'append a new scoring proposal'); END;
--> statement-breakpoint
CREATE TRIGGER `scoring_proposals_immutable_delete` BEFORE DELETE ON `scoring_proposals` BEGIN SELECT RAISE(ABORT, 'scoring proposal is immutable'); END;
