<?php

namespace App\Entity;

use App\Repository\ExperienceRepository;
use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity(repositoryClass: ExperienceRepository::class)]
class Experience
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    /** Canonical phone id from App A — this is what makes the captured data deterministic. */
    #[ORM\Column]
    private int $phoneId;

    /** Canonical phone name, copied from App A at selection time. */
    #[ORM\Column(length: 200)]
    private string $phoneName;

    #[ORM\Column]
    private int $rating = 0;

    #[ORM\Column(type: Types::TEXT, nullable: true)]
    private ?string $comment = null;

    #[ORM\Column(type: Types::DATETIME_IMMUTABLE)]
    private \DateTimeImmutable $createdAt;

    public function __construct()
    {
        $this->createdAt = new \DateTimeImmutable();
    }

    public function getId(): ?int { return $this->id; }
    public function getPhoneId(): int { return $this->phoneId; }
    public function setPhoneId(int $v): self { $this->phoneId = $v; return $this; }
    public function getPhoneName(): string { return $this->phoneName; }
    public function setPhoneName(string $v): self { $this->phoneName = $v; return $this; }
    public function getRating(): int { return $this->rating; }
    public function setRating(int $v): self { $this->rating = $v; return $this; }
    public function getComment(): ?string { return $this->comment; }
    public function setComment(?string $v): self { $this->comment = $v; return $this; }
    public function getCreatedAt(): \DateTimeImmutable { return $this->createdAt; }

    public function toArray(): array
    {
        return [
            'id' => $this->id,
            'phoneId' => $this->phoneId,
            'phoneName' => $this->phoneName,
            'rating' => $this->rating,
            'comment' => $this->comment,
            'createdAt' => $this->createdAt->format(\DateTimeInterface::ATOM),
        ];
    }
}
